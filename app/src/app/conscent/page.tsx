"use client";

import { useEffect } from "react";
import ContentBox from "@/layout/ContentBox";

export default function CookieConscent() {
  useEffect(() => {
    const cookieBotWrapper = document.getElementById("CookiebotDeclaration");
    if (cookieBotWrapper) {
      const script = document.createElement("script");
      script.id = "CookieDeclaration";
      script.type = "text/javascript";
      script.async = true;
      script.src = `https://consent.cookiebot.com/c578fa10-0990-4928-aa4b-5f44629c7067/cd.js`;

      cookieBotWrapper.appendChild(script);
    }
  }, []);

  return (
    <ContentBox title="Cookie Conscent" subtitle="View, edit, or withdraw conscent!">
      <div id="CookiebotDeclaration" />
    </ContentBox>
  );
}