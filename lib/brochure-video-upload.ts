import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client as SshClient } from 'ssh2';
import { createAdminClient } from '@/lib/supabase/admin';
import { BROCHURE_UPLOAD_BUCKET, BROCHURE_UPLOAD_PATH_RE } from '@/lib/brochure-video-contract';

// L'exécution SSH démarre dans /home/ubuntu, alors que systemd exécute le
// worker avec WorkingDirectory=/home/ubuntu/moana. Utiliser le chemin absolu
// garantit que l'upload et le worker lisent le même dossier.
const REMOTE_JOBS_ROOT = '/home/ubuntu/moana/var/brochure-video-jobs';
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const SSH_TIMEOUT_MS = 60_000;
// Sous-ensemble strict du contrat backend workers/brochure_video_runner.py:_JOB_ID_RE
// (^[A-Za-z0-9_-]{1,128}$) : alphanumérique pur, 16-32 caractères, pour éliminer
// toute ambiguïté d'échappement dans l'unité systemd instanciée moana-brochure-video@<jobId>.
export const JOB_ID_RE = /^[A-Za-z0-9]{16,32}$/;
const JOB_ID_LENGTH = 24;
const UPLOAD_PATH_LENGTH = 32;
const JOB_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PDF_SIGNATURE = Buffer.from('%PDF-');
// Mirroir de workers/brochure_video_runner.py:_default_job_paths — state/{jobId}.json
// sous la même racine que les jobs, jamais un chemin distinct hors de son contrôle.
const STATUS_MARKER_ABSENT_SENTINEL = '__BROCHURE_VIDEO_STATUS_ABSENT__';
export const STATUS_SSH_TIMEOUT_MS = 15_000;
const MAX_MARKER_BYTES = 32 * 1024;
// Mirroir de workers/video_assembler.py:252 (SupabaseStoragePublishCheckpoint,
// bucket par défaut "videos") tel qu'utilisé sans override par
// workers/brochure_video_runner.py:629 pour publish_checkpoint — jamais le
// bucket "veo-clips", qui ne stocke que les clips Veo intermédiaires
// (SupabaseVeoStorageCheckpoint/SupabaseClipSource, brochure_video_runner.py:388,482).
// _object_key (video_assembler.py:377-378) préfixe déjà la clé par
// "videos/{digest16}/{job}.mp4" : le chemin public reflète donc bucket +
// clé sans déduplication, exactement comme _object_url (video_assembler.py:270)
// le fait côté serveur.
const VIDEO_STORAGE_BUCKET = 'videos';

function resolveRemoteHost(): string {
  const host = process.env.MOANA_SSH_HOST?.trim();
  if (!host) {
    throw new Error('Configuration serveur manquante: MOANA_SSH_HOST');
  }
  return host;
}

interface RemoteTarget {
  username: string;
  hostname: string;
}

/** MOANA_SSH_HOST est au format `user@host` (ex. ubuntu@51.44.220.145). */
function parseRemoteTarget(host: string): RemoteTarget {
  const [username, hostname] = host.split('@');
  if (!username || !hostname) {
    throw new Error('Configuration serveur invalide: MOANA_SSH_HOST doit être au format user@host');
  }
  return { username, hostname };
}

function randomAlphanumeric(length: number): string {
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i += 1) {
    id += JOB_ID_ALPHABET[bytes[i] % JOB_ID_ALPHABET.length];
  }
  return id;
}

function generateSecureJobId(): string {
  return randomAlphanumeric(JOB_ID_LENGTH);
}

/** Conforme à BROCHURE_UPLOAD_PATH_RE : seule fonction autorisée à produire ce chemin. */
function generateUploadPath(): string {
  return `${randomAlphanumeric(UPLOAD_PATH_LENGTH)}.pdf`;
}

interface SshResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface BrochureVideoDeps {
  runSsh: (command: string, opts?: { input?: Buffer | string; timeoutMs?: number }) => Promise<SshResult>;
  generateJobId: () => string;
  downloadUploadedPdf: (path: string) => Promise<Buffer>;
  deleteUploadedPdf: (path: string) => Promise<void>;
}

export interface UploadTicket {
  bucket: string;
  path: string;
  token: string;
}

export interface UploadTicketDeps {
  generateUploadPath: () => string;
  createSignedUploadUrl: (path: string) => Promise<{ path: string; token: string }>;
}

export type BrochureVideoStatusValue = 'running' | 'done' | 'failed';

export interface BrochureVideoStatusResult {
  status: BrochureVideoStatusValue;
  videoUrl: string | null;
  error: string | null;
}

export interface BrochureVideoStatusDeps {
  runSsh: BrochureVideoDeps['runSsh'];
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Concatène `chunk` à `buffer` en plafonnant à `maxBytes`, pour borner la
 * mémoire pendant la lecture elle-même plutôt qu'après coup sur le total
 * final. Une fois `overflowed` vrai, tout chunk suivant est ignoré : l'appelant
 * (createSshRunner) tue alors le process au lieu de le laisser continuer à
 * produire une sortie qui ne sera de toute façon plus retenue.
 */
export function boundedAppend(
  buffer: string,
  chunk: string,
  maxBytes: number,
  overflowed: boolean
): { value: string; overflowed: boolean } {
  if (overflowed) {
    return { value: buffer, overflowed: true };
  }
  const next = buffer + chunk;
  // Le contrat est en octets (MAX_MARKER_BYTES), pas en unités de code
  // JavaScript : .length compterait un caractère multioctet (accents, emoji)
  // comme une seule unité alors qu'il occupe plusieurs octets UTF-8.
  if (Buffer.byteLength(next, 'utf8') > maxBytes) {
    // Tronque au niveau des octets puis redécode : une séquence UTF-8 coupée
    // en plein milieu devient un caractère de remplacement plutôt qu'un
    // décompte d'octets faussé ou une exception.
    return { value: Buffer.from(next, 'utf8').subarray(0, maxBytes).toString('utf8'), overflowed: true };
  }
  return { value: next, overflowed: false };
}

/**
 * Client SSH pur Node (`ssh2`), sans dépendance au binaire système `ssh` —
 * absent des fonctions serverless Vercel (runtime Node.js/AWS Lambda), ce qui
 * faisait échouer `spawn('ssh', ...)` avec `ENOENT` en production. `ssh2`
 * fonctionne en JS pur (repli sans bindings natifs si non compilables).
 */
function createSshRunner(keyPath: string, host: string): BrochureVideoDeps['runSsh'] {
  const { username, hostname } = parseRemoteTarget(host);
  return (command, opts = {}) =>
    new Promise<SshResult>((resolve, reject) => {
      const timeoutMs = opts.timeoutMs ?? SSH_TIMEOUT_MS;
      // Lue paresseusement ici (pas à la création du runner) : certains
      // appelants construisent les deps sans jamais déclencher d'appel SSH
      // réel (ex. génération de jobId seule), avec un keyPath fictif.
      const privateKey = readFileSync(keyPath);
      const conn = new SshClient();
      let settled = false;

      const finish = (result: { ok: true; value: SshResult } | { ok: false; error: Error }) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        conn.end();
        if (result.ok) {
          resolve(result.value);
        } else {
          reject(result.error);
        }
      };

      const timer = setTimeout(() => finish({ ok: false, error: new Error('SSH command timed out') }), timeoutMs);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            finish({ ok: false, error: err });
            return;
          }
          let stdout = '';
          let stderr = '';
          let overflowed = false;
          // Plafonne l'accumulation en mémoire pendant la lecture elle-même (pas
          // seulement après coup) : un marker distant anormalement volumineux
          // termine le flux au lieu de gonfler stdout/stderr sans limite.
          const onChunk = (buffer: string, chunk: Buffer): string => {
            const result = boundedAppend(buffer, chunk.toString(), MAX_MARKER_BYTES, overflowed);
            overflowed = result.overflowed;
            if (overflowed) {
              stream.close();
            }
            return result.value;
          };
          stream.on('data', (chunk: Buffer) => { stdout = onChunk(stdout, chunk); });
          stream.stderr.on('data', (chunk: Buffer) => { stderr = onChunk(stderr, chunk); });
          stream.on('close', (code: number | null) => {
            finish({ ok: true, value: { code: code ?? 1, stdout, stderr } });
          });
          stream.end(opts.input ?? '');
        });
      });
      conn.on('error', (err) => finish({ ok: false, error: err }));
      conn.connect({
        host: hostname,
        username,
        privateKey,
        readyTimeout: timeoutMs,
      });
    });
}

/**
 * Câblage de production : clé SSH temporaire déjà écrite sur `keyPath`, hôte exigé
 * depuis `MOANA_SSH_HOST` (lève une erreur de configuration si absent — jamais de
 * repli sur une valeur codée en dur), jobId alphanumérique cryptographique.
 *
 * `downloadUploadedPdf`/`deleteUploadedPdf` passent par `createAdminClient()`
 * (service_role, bypass RLS) : ce bucket est backend-only, jamais exposé en
 * lecture/écriture directe côté client (cf. brochure-video-contract.ts).
 */
export function createProductionDeps(keyPath: string): BrochureVideoDeps {
  return {
    runSsh: createSshRunner(keyPath, resolveRemoteHost()),
    generateJobId: generateSecureJobId,
    downloadUploadedPdf: async (path) => {
      const { data, error } = await createAdminClient().storage.from(BROCHURE_UPLOAD_BUCKET).download(path);
      if (error || !data) {
        throw new Error(error?.message ?? 'download returned no data');
      }
      return Buffer.from(await data.arrayBuffer());
    },
    deleteUploadedPdf: async (path) => {
      const { error } = await createAdminClient().storage.from(BROCHURE_UPLOAD_BUCKET).remove([path]);
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

/**
 * Câblage de production du ticket d'upload : signe une URL de dépôt à usage
 * unique (expiration fixe 2h côté Supabase, non configurable) pour un chemin
 * fraîchement généré — jamais réutilisé, jamais fourni par le client.
 */
export function createProductionUploadTicketDeps(): UploadTicketDeps {
  return {
    generateUploadPath,
    createSignedUploadUrl: async (path) => {
      const { data, error } = await createAdminClient().storage.from(BROCHURE_UPLOAD_BUCKET).createSignedUploadUrl(path);
      if (error || !data) {
        throw new Error(error?.message ?? 'createSignedUploadUrl returned no data');
      }
      return { path: data.path, token: data.token };
    },
  };
}

/**
 * Cœur testable de la route POST /api/brochure-video/upload-url : ne touche
 * jamais le SDK Supabase directement, tout accès Storage passe par `deps`.
 */
export async function handleCreateUploadTicket(deps: UploadTicketDeps): Promise<NextResponse> {
  const path = deps.generateUploadPath();
  try {
    const ticket = await deps.createSignedUploadUrl(path);
    const body: UploadTicket = { bucket: BROCHURE_UPLOAD_BUCKET, path: ticket.path, token: ticket.token };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error(
      "brochure-video: création de l'URL de dépôt signée échouée:",
      error instanceof Error ? error.message : 'unknown error'
    );
    return jsonError("Configuration du service d'upload indisponible", 500);
  }
}

/**
 * Cœur testable de la route POST /api/brochure-video : ne touche jamais
 * MOANA_SSH_KEY ni le réseau, tout accès distant passe par `deps` injecté par
 * l'appelant. Ne reçoit plus le PDF dans le corps de la requête (limite
 * plateforme Vercel de 4,5 Mo par corps de Vercel Function, non contournable
 * côté code) — seulement la référence `path` vers l'objet déjà déposé côté
 * navigateur via une URL de dépôt signée (POST /api/brochure-video/upload-url).
 */
export async function handleBrochureVideoUpload(
  request: NextRequest,
  deps: BrochureVideoDeps
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps JSON invalide', 400);
  }

  const path = (body as { path?: unknown } | null)?.path;
  if (typeof path !== 'string' || !BROCHURE_UPLOAD_PATH_RE.test(path)) {
    return jsonError('Référence de fichier invalide', 400);
  }

  let buffer: Buffer;
  try {
    buffer = await deps.downloadUploadedPdf(path);
  } catch (error) {
    console.error(
      'brochure-video: téléchargement du PDF uploadé échoué:',
      error instanceof Error ? error.message : 'unknown error'
    );
    return jsonError('Fichier introuvable ou déjà traité', 404);
  }

  try {
    if (buffer.length === 0) {
      return jsonError('Fichier PDF manquant', 400);
    }
    if (buffer.length > MAX_PDF_BYTES) {
      return jsonError('Fichier PDF trop volumineux', 400);
    }
    if (!buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
      return jsonError('Contenu PDF invalide', 400);
    }

    const jobId = deps.generateJobId();
    if (!JOB_ID_RE.test(jobId)) {
      console.error('generateJobId a produit un identifiant hors du contrat backend');
      return jsonError('Erreur serveur', 500);
    }

    const documentDigest = createHash('sha256').update(buffer).digest('hex');
    const manifest = JSON.stringify({ document_digest: documentDigest });
    const jobDir = `${REMOTE_JOBS_ROOT}/${jobId}`;
    const pdfTmpPath = `${jobDir}/input.pdf.tmp`;
    const pdfFinalPath = `${jobDir}/input.pdf`;
    const manifestTmpPath = `${jobDir}/manifest.json.tmp`;
    const manifestFinalPath = `${jobDir}/manifest.json`;

    try {
      const mkdirResult = await deps.runSsh(`mkdir -p ${jobDir}`);
      if (mkdirResult.code !== 0) {
        throw new Error('remote mkdir failed');
      }

      // Écriture sur un chemin temporaire puis renommage atomique : un transfert
      // interrompu ne laisse jamais input.pdf/manifest.json dans un état partiel.
      const pdfResult = await deps.runSsh(`cat > ${pdfTmpPath} && mv -f ${pdfTmpPath} ${pdfFinalPath}`, { input: buffer });
      if (pdfResult.code !== 0) {
        throw new Error('remote pdf transfer failed');
      }

      const manifestResult = await deps.runSsh(`cat > ${manifestTmpPath} && mv -f ${manifestTmpPath} ${manifestFinalPath}`, { input: manifest });
      if (manifestResult.code !== 0) {
        throw new Error('remote manifest transfer failed');
      }

      // Ne pas attendre la fin du service oneshot : l'API doit rendre le jobId
      // immédiatement, puis le client suit state/{jobId}.json par polling.
      const startResult = await deps.runSsh(`sudo systemctl --no-block start moana-brochure-video@${jobId}`);
      if (startResult.code !== 0) {
        throw new Error('remote systemctl start failed');
      }
    } catch (error) {
      console.error(
        'brochure-video remote job launch failed:',
        error instanceof Error ? error.message : 'unknown error'
      );
      return jsonError('Échec du lancement du job distant', 502);
    }

    return NextResponse.json(
      { jobId, statusUrl: `/api/brochure-video/${jobId}/status` },
      { status: 200 }
    );
  } finally {
    // Best-effort : le PDF est soit déjà copié sur EC2, soit rejeté — il ne
    // doit dans aucun cas s'accumuler indéfiniment dans le bucket d'upload.
    deps.deleteUploadedPdf(path).catch((error) => {
      console.error(
        'brochure-video: suppression du PDF uploadé échouée:',
        error instanceof Error ? error.message : 'unknown error'
      );
    });
  }
}

function statusResult(
  status: BrochureVideoStatusValue,
  videoUrl: string | null,
  error: string | null
): BrochureVideoStatusResult {
  return { status, videoUrl, error };
}

function failedStatusResult(error: string): BrochureVideoStatusResult {
  return statusResult('failed', null, error);
}

function resolvePublicVideoUrl(objectKey: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) {
    return null;
  }
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${VIDEO_STORAGE_BUCKET}/${objectKey}`;
}

// Message distinctif renvoyé uniquement pour une panne de transport SSH
// (spawn en erreur, ou code de sortie non nul — le `|| echo` de la commande
// garantit sinon toujours un code 0). La route GET s'appuie sur cette
// constante, jamais sur une correspondance de texte ad hoc, pour choisir 502
// plutôt que 200 : c'est la seule branche qui indique une panne d'infra
// plutôt qu'une réponse de domaine normale (y compris un job "failed").
export const STATUS_TRANSPORT_ERROR_MESSAGE = 'Statut du job indisponible';

/**
 * Cœur testable de la route GET status : ne touche jamais MOANA_SSH_KEY ni le
 * réseau, tout accès distant passe par `deps.runSsh` injecté par l'appelant.
 *
 * jobId est validé avant toute commande SSH. Le marker distant est lu avec un
 * `test -f ... && cat ... || echo <sentinel>` : un marker absent (le job vient
 * de démarrer, `AtomicJobStateStore.begin()` côté worker n'a pas encore écrit
 * son snapshot) est donc distingué d'une vraie panne de transport SSH sans
 * dépendre du contenu de stdout/stderr, jamais journalisé ici.
 */
export async function readBrochureVideoStatus(
  jobId: string,
  deps: BrochureVideoStatusDeps
): Promise<BrochureVideoStatusResult> {
  if (!JOB_ID_RE.test(jobId)) {
    return failedStatusResult('Identifiant de job invalide');
  }

  const markerPath = `${REMOTE_JOBS_ROOT}/state/${jobId}.json`;
  const command = `test -f ${markerPath} && cat ${markerPath} || echo '${STATUS_MARKER_ABSENT_SENTINEL}'`;

  let sshResult: SshResult;
  try {
    sshResult = await deps.runSsh(command, { timeoutMs: STATUS_SSH_TIMEOUT_MS });
  } catch {
    return failedStatusResult(STATUS_TRANSPORT_ERROR_MESSAGE);
  }

  if (sshResult.code !== 0) {
    return failedStatusResult(STATUS_TRANSPORT_ERROR_MESSAGE);
  }

  const stdout = sshResult.stdout.trim();
  if (Buffer.byteLength(stdout, 'utf8') > MAX_MARKER_BYTES) {
    return failedStatusResult('Statut du job illisible');
  }
  if (stdout === '' || stdout === STATUS_MARKER_ABSENT_SENTINEL) {
    // Marker pas encore écrit : job accepté par systemd, snapshot pas encore
    // persisté par le worker. Traité comme "running", jamais comme une erreur.
    return statusResult('running', null, null);
  }

  let marker: unknown;
  try {
    marker = JSON.parse(stdout);
  } catch {
    return failedStatusResult('Statut du job illisible');
  }

  if (typeof marker !== 'object' || marker === null) {
    return failedStatusResult('Statut du job illisible');
  }
  const rawStatus = (marker as { status?: unknown }).status;

  if (rawStatus === 'running') {
    return statusResult('running', null, null);
  }
  if (rawStatus === 'failed') {
    const reason = (marker as { reason?: unknown }).reason;
    return failedStatusResult(typeof reason === 'string' && reason.trim() ? reason : "Le job a échoué");
  }
  if (rawStatus === 'done') {
    const result = (marker as { result?: unknown }).result;
    const objectKey =
      result && typeof result === 'object' && typeof (result as { object_key?: unknown }).object_key === 'string'
        ? (result as { object_key: string }).object_key
        : null;
    if (!objectKey) {
      return failedStatusResult('Statut du job illisible');
    }
    return statusResult('done', resolvePublicVideoUrl(objectKey), null);
  }

  return failedStatusResult('Statut du job illisible');
}
