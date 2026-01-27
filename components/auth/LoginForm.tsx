'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Anchor, ArrowRight, ShieldCheck } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/lib/validations';
import { Button, Input } from '@/components/ui';
import { motion } from 'framer-motion';

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: data.broker, password: data.password }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || 'Identifiants invalides');
      } else {
        toast.success('Bienvenue à bord');
        router.push('/dashboard');
        router.refresh();
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex relative overflow-hidden bg-primary-950 font-sans selection:bg-secondary-500 selection:text-white">
      
      {/* Background Ambience (Mesh Gradient + Noise) */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary-800/40 rounded-full blur-[120px] animate-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary-600/20 rounded-full blur-[120px] animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[20%] w-[40%] h-[40%] bg-secondary-600/10 rounded-full blur-[100px] animate-glow" />
      </div>

      <div className="container mx-auto px-4 h-screen flex flex-col lg:flex-row items-center justify-center lg:justify-between relative z-10">
        
        {/* Left Section: Brand / Welcome */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="lg:w-1/2 text-center lg:text-left mb-12 lg:mb-0 lg:pr-12"
        >
          <div className="inline-flex items-center justify-center p-3 mb-6 bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl shadow-2xl">
            <Anchor className="h-8 w-8 text-secondary-400" />
          </div>
          <h1 className="text-5xl lg:text-7xl font-heading font-bold text-white mb-6 leading-tight tracking-tight">
            Moana <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary-300 to-secondary-500">
              Yachting
            </span>
          </h1>
          <p className="text-lg text-primary-200/80 max-w-md mx-auto lg:mx-0 font-light leading-relaxed">
            Plateforme exclusive de gestion de flotte pour courtiers d'élite. Accédez à vos listings et opportunités en temps réel.
          </p>
          
          <div className="mt-8 flex items-center justify-center lg:justify-start gap-4 text-sm text-primary-300/60 font-medium">
             <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Accès Sécurisé</span>
             <span className="w-1 h-1 bg-current rounded-full" />
             <span>Broker Portal v2.0</span>
          </div>
        </motion.div>

        {/* Right Section: Glass Login Card */}
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <div className="relative group">
            {/* Glow Effect behind card */}
            <div className="absolute -inset-1 bg-gradient-to-r from-secondary-500/20 to-primary-500/20 rounded-2xl blur-xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
            
            <div className="relative bg-primary-900/40 border border-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl ring-1 ring-white/5">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-2 font-heading">Connexion</h2>
                <p className="text-primary-200/60 text-sm">Entrez vos identifiants pour continuer.</p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-1">
                  <Input
                    label="Identifiant Broker"
                    placeholder="ex: julien"
                    error={errors.broker?.message}
                    required
                    autoComplete="username"
                    className="bg-primary-950/50 border-primary-700/50 text-white placeholder:text-primary-400/50 focus:border-secondary-500/50 focus:ring-secondary-500/20"
                    {...register('broker')}
                  />
                </div>

                <div className="space-y-1">
                  <Input
                    label="Mot de passe"
                    type="password"
                    placeholder="••••••••"
                    error={errors.password?.message}
                    required
                    autoComplete="current-password"
                    className="bg-primary-950/50 border-primary-700/50 text-white placeholder:text-primary-400/50 focus:border-secondary-500/50 focus:ring-secondary-500/20"
                    {...register('password')}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-secondary-600 to-secondary-500 hover:from-secondary-500 hover:to-secondary-400 text-white font-bold tracking-wide shadow-lg shadow-secondary-900/20 border border-white/10"
                  loading={loading}
                >
                  <span className="mr-2">ACCÉDER AU DASHBOARD</span>
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </Button>
              </form>
              
              <div className="mt-6 pt-6 border-t border-white/5 text-center">
                <p className="text-xs text-primary-400/60">
                  Problème de connexion ? <a href="#" className="text-secondary-400 hover:text-secondary-300 transition-colors underline decoration-secondary-500/30">Contacter le support</a>
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}