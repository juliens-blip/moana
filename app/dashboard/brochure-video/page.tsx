import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BrochureVideoUploader } from '@/components/brochure-video/BrochureVideoUploader';

export const dynamic = 'force-dynamic';

export default function BrochureVideoPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <Link href="/dashboard" className="inline-block animate-fade-in" style={{ animationDelay: '100ms' }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">
          Vidéo promotionnelle depuis une brochure
        </h1>
        <p className="text-gray-600 mt-2">
          Envoyez le PDF d&apos;une brochure pour générer automatiquement une vidéo promotionnelle.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow hover:shadow-md transition-smooth p-6 animate-fade-in-up hw-accelerate" style={{ animationDelay: '200ms' }}>
        <BrochureVideoUploader />
      </div>
    </div>
  );
}
