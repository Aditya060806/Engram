import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"

// Guest login is enabled only when ALLOW_GUEST_LOGIN=true (local dev).
// In production (Vercel) this stays off, so real OAuth is the only way in.
const guestEnabled = process.env.ALLOW_GUEST_LOGIN === "true"

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    GitHub,
    Google,
    ...(guestEnabled
      ? [
          Credentials({
            id: "guest",
            name: "Guest",
            credentials: {},
            authorize: async () => ({
              id: "guest-local",
              name: "Guest",
              email: "guest@engram.local",
            }),
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
})
