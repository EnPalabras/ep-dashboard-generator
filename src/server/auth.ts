import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, Request, Response, NextFunction } from "express";

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      picture: string;
    }
  }
}

const ALLOWED_DOMAIN = "enpalabras.com.ar";

const DEV_USER: User = {
  id: "dev",
  email: "dev@enpalabras.com.ar",
  name: "Dev User",
  picture: "",
};

export const authEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function setupAuth(app: Express) {
  if (!authEnabled) {
    console.log("[auth] Google OAuth credentials not set — running without auth (dev mode)");
    return;
  }

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "change-me-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user: Express.User, done) => done(null, user));

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;

        if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          return done(null, false, { message: `Only @${ALLOWED_DOMAIN} emails allowed` } as any);
        }

        const user: User = {
          id: profile.id,
          email,
          name: profile.displayName,
          picture: profile.photos?.[0]?.value || "",
        };

        return done(null, user);
      }
    )
  );

  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/auth/denied" }),
    (_req, res) => res.redirect("/")
  );

  app.get("/auth/denied", (_req, res) => {
    res.status(403).send(`
      <!DOCTYPE html>
      <html><head><title>Access Denied</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
      </head><body style="display:flex;justify-content:center;align-items:center;min-height:100vh;">
      <main style="text-align:center;">
        <h1>Access Denied</h1>
        <p>Only @${ALLOWED_DOMAIN} email addresses can access this app.</p>
        <a href="/auth/google">Try again</a>
      </main></body></html>
    `);
  });

  app.get("/auth/logout", (req, res) => {
    req.logout(() => res.redirect("/"));
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authEnabled) {
    req.user = DEV_USER;
    return next();
  }
  if (req.isAuthenticated()) return next();
  res.redirect("/auth/google");
}
