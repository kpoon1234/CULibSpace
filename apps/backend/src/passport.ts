import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { PrismaClient, UserType } from '@prisma/client';

const prisma = new PrismaClient();

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables');
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:8080/auth/google/callback',
    },
    async (_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email returned from Google'), undefined);
        }

        const givenName = profile.name?.givenName || profile.displayName?.split(' ')[0] || '';
        const familyName =
          profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
        const googleId = profile.id;

        const phone = googleId.slice(-10);

        let user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          const maxUser = await prisma.user.findFirst({
            orderBy: { uid: 'desc' },
            select: { uid: true },
          });

          const nextUid = (maxUser?.uid ?? 0) + 1;

          user = await prisma.user.create({
            data: {
              uid: nextUid,
              email,
              firstname: givenName,
              lastname: familyName,
              phone,
              userType: UserType.UNIVERSITY,
            },
          });
        } else {
          user = await prisma.user.update({
            where: { email },
            data: {
              firstname: givenName,
              lastname: familyName,
            },
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, (user as any).uid);
});

passport.deserializeUser(async (uid: number, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { uid },
    });
    done(null, user);
  } catch (error) {
    done(error as Error, undefined);
  }
});

export default passport;
