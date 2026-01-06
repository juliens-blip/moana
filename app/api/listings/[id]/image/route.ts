import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getListing, updateListingImage } from '@/lib/supabase/listings';
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
    console.log('[API Upload] Request received for listing:', params.id);

    const session = await getSession();

    if (!session) {
      console.warn('[API Upload] Unauthorized attempt');
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Non authentifie' },
        { status: 401 }
      );
    }

    console.log('[API Upload] Session validated:', session.brokerId);

    const existing = await getListing(params.id);
    if (!existing) {
      console.error('[API Upload] Listing not found:', params.id);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bateau non trouve' },
        { status: 404 }
      );
    }

    console.log('[API Upload] Parsing FormData...');
    const formData = await request.formData();
    const file = formData.get('file');

    console.log('[API Upload] File received:', {
      hasFile: !!file,
      isFileInstance: file instanceof File,
      fileName: file instanceof File ? file.name : 'N/A',
      fileSize: file instanceof File ? file.size : 'N/A',
      fileType: file instanceof File ? file.type : 'N/A'
    });

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
    const filePath = `listings/${params.id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${safeExtension}`;

    console.log('[API Upload] Generated file path:', filePath);
    console.log('[API Upload] Converting to buffer...');

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log('[API Upload] Buffer size:', buffer.length);

    const supabase = createAdminClient();
    console.log('[API Upload] Uploading to Supabase Storage...');

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[API Upload] Supabase upload error:', uploadError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Erreur lors de l\'upload' },
        { status: 500 }
      );
    }

    console.log('[API Upload] File uploaded successfully to Supabase');

    const { data: publicData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const imageUrl = publicData.publicUrl;
    console.log('[API Upload] Public URL generated:', imageUrl);

    console.log('[API Upload] Updating database...');
    const updated = await updateListingImage(params.id, imageUrl);
    console.log('[API Upload] Database updated successfully');

    if (existing.image_url && existing.image_url !== imageUrl) {
      console.log('[API Upload] Removing old image:', existing.image_url);
      const oldPath = getStoragePathFromPublicUrl(existing.image_url);
      if (oldPath) {
        const { error: removeError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([oldPath]);
        if (removeError) {
          console.warn('[API Upload] Failed to remove old image:', removeError);
        } else {
          console.log('[API Upload] Old image removed successfully');
        }
      }
    }

    console.log('[API Upload] Upload process completed successfully');

    return NextResponse.json<ApiResponse>({
      success: true,
      data: updated,
      message: 'Image ajoutee avec succes',
    });
  } catch (error) {
    console.error('[API Upload] CRITICAL ERROR:', error);
    console.error('[API Upload] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'N/A'
    });
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

    const existing = await getListing(params.id);
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
        const { error: removeError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([oldPath]);
        if (removeError) {
          console.warn('[deleteListingImage] Failed to remove image:', removeError);
        }
      }
    }

    const updated = await updateListingImage(params.id, null);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: updated,
      message: 'Image supprimee',
    });
  } catch (error) {
    console.error('Error in DELETE /api/listings/[id]/image:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
