# AGENTS SUPREME - Catalogue Complet des Agents

> Fichier de reference pour tous les agents disponibles. Reutilisable dans d'autres projets.
> Derniere mise a jour: 2026-01-02

---

## INDEX RAPIDE

| Categorie | Agents |
|-----------|--------|
| **Code & Dev** | code-reviewer, debugger, frontend-developer, backend-architect, fullstack-developer, explore-code, explore-style, test-code, test-engineer |
| **AI & Prompts** | prompt-engineer, mcp-expert, mcp-creator, mcp-doctor, mcp-server-architect, mcp-testing-engineer |
| **Design & UX** | ui-ux-designer, video-editor |
| **Marketing & SEO** | content-marketer, seo-analyzer, seo-podcast-optimizer |
| **Legal & Compliance** | legal-advisor |
| **Workflow & Orchestration** | **apex-workflow**, context-manager, epct, moana-epct, agent_controle |

---

## AGENTS PAR CATEGORIE

### 1. CODE & DEVELOPPEMENT

#### code-reviewer
```yaml
name: code-reviewer
model: sonnet
tools: Read, Write, Edit, Bash, Grep
usage: Apres ecriture/modification de code
```
**Description:** Review de code expert pour qualite, securite et maintenabilite.

**Quand l'utiliser:**
- Apres avoir ecrit du code significatif
- Avant un commit important
- Pour auditer du code existant

**Checklist:**
- Code simple et lisible
- Nommage correct
- Pas de duplication
- Gestion d'erreurs
- Pas de secrets exposes
- Validation des inputs

---

#### debugger
```yaml
name: debugger
model: sonnet
tools: Read, Write, Edit, Bash, Grep
usage: En cas d'erreur ou comportement inattendu
```
**Description:** Specialiste debugging pour erreurs, echecs de tests, comportements inattendus.

**Quand l'utiliser:**
- Stack trace a analyser
- Tests qui echouent
- Comportement inattendu
- Problemes de performance

**Process:**
1. Capture erreur + stack trace
2. Identifie etapes de reproduction
3. Isole la source
4. Implemente fix minimal
5. Verifie solution

---

#### frontend-developer
```yaml
name: frontend-developer
model: sonnet
tools: Read, Write, Edit, Bash
usage: Composants React, UI responsive, state management
```
**Description:** Specialiste frontend pour React, design responsive, accessibilite.

**Focus:**
- Architecture composants React (hooks, context)
- CSS responsive (Tailwind/CSS-in-JS)
- State management (Redux, Zustand, Context)
- Performance (lazy loading, code splitting)
- Accessibilite WCAG

**Output:**
- Composant React complet avec props
- Styling solution
- Tests unitaires
- Checklist accessibilite

---

#### backend-architect
```yaml
name: backend-architect
model: sonnet
tools: Read, Write, Edit, Bash
usage: APIs REST, microservices, schemas DB
```
**Description:** Architecte systemes backend et design d'APIs.

**Focus:**
- Design API RESTful (versioning, error handling)
- Definition des limites de services
- Schema database (normalisation, index, sharding)
- Strategies de caching
- Patterns de securite (auth, rate limiting)

**Output:**
- Definitions endpoints API
- Diagramme architecture (mermaid/ASCII)
- Schema database
- Recommandations techno

---

#### fullstack-developer
```yaml
name: fullstack-developer
model: opus
tools: All
usage: Projets complets front+back
```
**Description:** Developpeur fullstack pour projets complets couvrant frontend et backend.

**Focus:**
- Integration frontend/backend
- Architecture complete
- DevOps basique
- Tests end-to-end

---

#### explore-code
```yaml
name: explore-code
model: sonnet
tools: Read, Grep, Glob, Bash
usage: Exploration codebase, recherche patterns
```
**Description:** Agent specialise dans l'exploration et comprehension de codebases.

**Quand l'utiliser:**
- Decouvrir une nouvelle codebase
- Trouver des patterns specifiques
- Comprendre l'architecture existante

---

#### explore-style
```yaml
name: explore-style
model: sonnet
tools: Read, Grep, Glob
usage: Analyse conventions, style code
```
**Description:** Analyse le style et les conventions d'un projet.

---

#### test-code
```yaml
name: test-code
model: sonnet
tools: Read, Write, Edit, Bash
usage: Tests specifiques pour code
```
**Description:** Creation et execution de tests pour code specifique.

---

### 2. AI & PROMPTS

#### prompt-engineer
```yaml
name: prompt-engineer
model: opus
tools: Read, Write, Edit
usage: Optimisation prompts LLM, features AI
```
**Description:** Expert optimisation de prompts pour LLMs et systemes AI.

**Techniques:**
- Few-shot vs zero-shot
- Chain-of-thought reasoning
- Role-playing
- Constitutional AI
- Tree of thoughts
- Prompt chaining

**Output obligatoire:**
- Le prompt complet (pas juste decrit)
- Notes d'implementation
- Guidelines d'usage
- Exemples de sortie attendue

---

#### mcp-expert
```yaml
name: mcp-expert
model: sonnet
tools: Read, Write, Edit
usage: Configurations MCP, integrations protocole
```
**Description:** Specialiste Model Context Protocol pour configurations et integrations.

**Focus:**
- Configurations serveur MCP en JSON
- Integrations API (GitHub, Stripe, Slack)
- Connecteurs database
- Securite et performance MCP

**Templates disponibles:**
- Database MCP (PostgreSQL, MySQL)
- API Integration MCP
- File System MCP

---

#### mcp-server-architect
```yaml
name: mcp-server-architect
model: sonnet
tools: Read, Write, Edit, Bash
usage: Architecture serveurs MCP avancee
```
**Description:** Architecte pour conception de serveurs MCP complexes.

---

#### mcp-testing-engineer
```yaml
name: mcp-testing-engineer
model: sonnet
tools: Read, Write, Edit, Bash
usage: Tests d'integrations MCP
```
**Description:** Ingenieur test specialise MCP.

---

#### mcp-creator
```yaml
name: mcp-creator
model: sonnet
tools: Read, Write, Edit, Bash
usage: Creation nouveaux serveurs MCP
```
**Description:** Specialiste creation de serveurs MCP from scratch.

**Focus:**
- Scaffolding serveurs MCP
- Implementation protocols
- Configuration JSON
- Documentation

---

#### mcp-doctor
```yaml
name: mcp-doctor
model: sonnet
tools: Read, Write, Edit, Bash, Grep
usage: Diagnostic et fix problemes MCP
```
**Description:** Diagnostique et repare les problemes de serveurs MCP.

**Quand l'utiliser:**
- Serveur MCP qui ne demarre pas
- Erreurs de connexion
- Problemes de configuration
- Debug integrations

---

### 3. DESIGN & UX

#### ui-ux-designer
```yaml
name: ui-ux-designer
model: sonnet
tools: Read, Write, Edit
usage: Recherche user, wireframes, design systems
```
**Description:** Specialiste UI/UX pour design centre utilisateur.

**Focus:**
- Recherche utilisateur et personas
- Wireframing et prototypage
- Creation design system
- Design inclusif et accessibilite
- Architecture information

**Output:**
- User journey maps
- Wireframes low/high fidelity
- Composants design system
- Specs prototype pour dev
- Plan tests utilisabilite

---

#### video-editor
```yaml
name: video-editor
model: opus
tools: Bash, Read, Write
usage: Montage video, effets, color correction
```
**Description:** Specialiste montage video et post-production.

**Focus:**
- Coupes et assemblage sequences
- Effets de transition
- Color correction/grading
- Synchronisation multi-piste
- Composition VFX

**Outils:** FFmpeg principalement

---

### 4. MARKETING & SEO

#### content-marketer
```yaml
name: content-marketer
model: sonnet
tools: Read, Write, WebSearch
usage: Blog posts, social media, email campaigns
```
**Description:** Specialiste content marketing et SEO.

**Focus:**
- Blog posts optimises SEO
- Contenu social media
- Campagnes email
- Meta descriptions
- Calendrier editorial

**Output:**
- Contenu avec optimisation SEO
- Variants meta/title
- Posts promotion social
- Subject lines email
- Plan distribution

---

#### seo-analyzer
```yaml
name: seo-analyzer
model: sonnet
tools: Read, Write, WebFetch, Grep, Glob
usage: Audits SEO technique, optimisation meta
```
**Description:** Specialiste analyse SEO et optimisation technique.

**Focus:**
- Audits SEO techniques
- Meta tags et titles
- Core Web Vitals
- Schema markup
- Structure linking interne

**Output:**
- Rapports audit detailles
- Recommandations meta
- Strategies Core Web Vitals
- Implementations schema

---

#### seo-podcast-optimizer
```yaml
name: seo-podcast-optimizer
model: sonnet
tools: Read, Write, WebSearch
usage: SEO pour podcasts (titres, descriptions, keywords)
```
**Description:** Optimisation SEO specifique podcasts.

---

### 5. LEGAL & COMPLIANCE

#### legal-advisor
```yaml
name: legal-advisor
model: opus
tools: Read, Write, WebSearch
usage: Privacy policies, ToS, GDPR, compliance
```
**Description:** Conseiller juridique pour documentation legale et compliance.

**Focus:**
- Privacy policies (GDPR, CCPA, LGPD)
- Terms of Service
- Cookie policies
- Data Processing Agreements
- Licences SaaS

**Regulations couvertes:**
- GDPR (EU)
- CCPA/CPRA (California)
- LGPD (Brazil)
- PIPEDA (Canada)
- COPPA (enfants)
- CAN-SPAM (email)

**Disclaimer:** Templates informatifs, consulter avocat pour avis legal.

---

### 6. WORKFLOW & ORCHESTRATION

#### apex-workflow (PRINCIPAL)
```yaml
name: apex-workflow
model: sonnet
tools: Read, Write, Edit, Bash, Grep, Glob, Task, TodoWrite, AskUserQuestion, Context7, WebSearch
usage: Taches complexes necessitant analyse + plan + implementation
```
**Description:** Agent orchestrateur principal avec workflow en 3 etapes.

**Workflow:**
1. **/analyze** - Exploration exhaustive (codebase + docs Context7)
2. **/plan** - Planification strategique detaillee
3. **/implement** - Execution controlee et validee

**Structure fichiers:**
```
tasks/
├── <nom-feature>/
│   ├── 01_analysis.md
│   ├── 02_plan.md
│   └── 03_implementation_log.md
```

**Regle d'or:** Ne JAMAIS coder avant d'avoir produit l'analyse ET le plan.

---

#### context-manager
```yaml
name: context-manager
model: opus
tools: Read, Write, Edit, TodoWrite
usage: Projets multi-agents, preservation contexte
```
**Description:** Gestion contexte pour workflows multi-agents et taches longues.

**Fonctions:**
- Capture contexte (decisions, patterns, TODOs)
- Distribution contexte (briefings agents)
- Gestion memoire (index, checkpoints)

**Formats contexte:**
- Quick (<500 tokens): tache courante, decisions recentes
- Full (<2000 tokens): architecture, decisions cles, APIs
- Archived: historique, solutions, patterns

---

#### epct (Expert Prompt Chain Thinking)
```yaml
name: epct
model: opus
tools: All
usage: Taches complexes multi-etapes
```
**Description:** Agent pour chaines de pensee expertes et taches complexes.

---

#### test-engineer
```yaml
name: test-engineer
model: sonnet
tools: Read, Write, Edit, Bash
usage: Tests unitaires, integration, e2e
```
**Description:** Ingenieur test pour couverture complete.

---

## MATRICE DE SELECTION RAPIDE

| Tache | Agent Recommande | Alternative |
|-------|------------------|-------------|
| Tache complexe multi-etapes | **apex-workflow** | epct |
| Review code | code-reviewer | debugger |
| Fix bug | debugger | code-reviewer |
| Explorer codebase | explore-code | apex-workflow |
| Nouveau composant React | frontend-developer | ui-ux-designer |
| Design API | backend-architect | fullstack-developer |
| Creer prompt | prompt-engineer | - |
| Audit SEO | seo-analyzer | content-marketer |
| Privacy policy | legal-advisor | - |
| Montage video | video-editor | - |
| Config MCP | mcp-expert | mcp-server-architect |
| Creer serveur MCP | mcp-creator | mcp-expert |
| Fix MCP | mcp-doctor | mcp-expert |
| Projet complexe long | apex-workflow | context-manager + epct |
| Choisir un agent | agent_controle | - |

---

## UTILISATION

### Invocation directe
```
@agent-name <tache>
```

### Via Task tool
```python
Task(
    subagent_type="agent-name",
    prompt="Description de la tache"
)
```

### Chaining
Pour taches complexes, combiner:
1. `context-manager` pour setup
2. Agent specialise pour execution
3. `code-reviewer` pour validation

---

*Catalogue maintenu par Claude Opus 4.5*
*Version: 1.1 - 2026-01-02*
*Total: 26 agents*
