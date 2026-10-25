import SignIn from "./sign-in";

export const metadata = { title: "Sign in · DeusADS" };

/** The sign-in screen. `notice` comes from the middleware (signed out for inactivity) or from an expired email link. */
export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const notice = typeof params?.notice === "string" ? params.notice : null;
  return <SignIn notice={notice} />;
}
