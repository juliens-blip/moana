import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTrackedListing, updateTrackedListingImage } from '@/lib/supabase/tracked-listings';
import type { ApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET_NAME = 'listing-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function getStoragePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return publicUrl.slice(index + marker.length);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Non authentifie' },
        { status: 401 }
      );
    }

    const existing = await getTrackedListing('bateaux_a_suivre', params.id);
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouve' },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Fichier manquant' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Format image invalide' },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Image trop lourde (max 5 Mo)' },
        { status: 400 }
      );
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'jpg';
    const filePath = `tracked/bateaux-a-suivre/${params.id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${safeExtension}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = createAdminClient();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Erreur lors de l\'upload' },
        { status: 500 }
      );
    }

    const { data: publicData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const imageUrl = publicData.publicUrl;

    const updated = await updateTrackedListingImage('bateaux_a_suivre', params.id, imageUrl);

    if (existing.image_url && existing.image_url !== imageUrl) {
      const oldPath = getStoragePathFromPublicUrl(existing.image_url);
      if (oldPath) {
        await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
      }
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: updated,
      message: 'Image ajoutee avec succes',
    });
  } catch (error) {
    console.error('Error in POST /api/bateaux-a-suivre/[id]/image:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Non authentifie' },
        { status: 401 }
      );
    }

    const existing = await getTrackedListing('bateaux_a_suivre', params.id);
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouve' },
        { status: 404 }
      );
    }

    const supabase = createAdminClient();

    if (existing.image_url) {
      const oldPath = getStoragePathFromPublicUrl(existing.image_url);
      if (oldPath) {
        await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
      }
    }

    const updated = await updateTrackedListingImage('bateaux_a_suivre', params.id, null);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: updated,
      message: 'Image supprimee',
    });
  } catch (error) {
    console.error('Error in DELETE /api/bateaux-a-suivre/[id]/image:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
