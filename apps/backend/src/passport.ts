import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { PrismaClient } from '@prisma/client';
import { AuthService } from './services/authService.js';
import { classifyEmail } from './utils/roleMapper.js';

const prisma = new PrismaClient();

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables');
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        `http://localhost:${process.env.PORT || 8080}/api/auth/google/callback`,
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

        // Delegate to AuthService for role mapping, polymorphic table creation, and JWT generation
        const authResult = await AuthService.authenticateUser({
          email,
          firstname: givenName,
          lastname: familyName,
          phone,
        });

        // Pass user object along with the generated JWT token
        return done(null, {
          ...authResult.user,
          token: authResult.token,
        });
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.uid);
});

passport.deserializeUser(async (uid: number, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { uid },
      include: {
        universityUser: true,
      },
    });

    if (!user) {
      return done(null, null);
    }

    const classification = classifyEmail(user.email);
    const profile = {
      uid: user.uid,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      phone: user.phone,
      behaviourScore: Number(user.behaviourScore),
      role: classification.role,
      userType: user.userType,
      studentId: user.universityUser?.studentId,
    };

    done(null, profile);
  } catch (error) {
    done(error as Error, undefined);
  }
});

export default passport;
