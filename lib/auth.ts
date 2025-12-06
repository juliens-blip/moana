import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { authenticateBroker } from '@/lib/airtable/brokers';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        broker: { label: 'Nom d\'utilisateur', type: 'text' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.broker || !credentials?.password) {
          return null;
        }

        try {
          const broker = await authenticateBroker(
            credentials.broker,
            credentials.password
          );

          if (broker) {
            return {
              id: broker.id,
              name: broker.fields.broker,
              email: broker.fields.broker + '@moana-yachting.com', // Fake email for NextAuth
            };
          }

          return null;
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.broker = user.name || user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.broker = token.broker as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
