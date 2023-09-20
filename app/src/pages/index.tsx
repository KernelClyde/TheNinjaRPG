import React, { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSafePush } from "../utils/routing";
import { useUserData } from "../utils/UserContext";
import Loader from "../layout/Loader";
import Welcome from "./welcome";
import type { NextPage } from "next";

/**
 * Either shows welcome page, user creation page, or profile
 */
const Home: NextPage = () => {
  const router = useSafePush();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { data: userData, status: userStatus } = useUserData();

  useEffect(() => {
    if (userStatus !== "loading" && !userData) {
      void router.push("/register");
    }
    if (userData && userId) {
      void router.push("/profile");
    }
  }, [router, userData, userId, userStatus]);

  if (isLoaded && !isSignedIn) {
    return <Welcome />;
  }

  return <Loader explanation="Fetching user data..." />;
};

export default Home;
