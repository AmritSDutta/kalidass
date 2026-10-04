import React, {type ReactNode} from "react";
import {AuthProvider} from "../lib/auth";

export default function Root({children}: {children: ReactNode}) {
  return <AuthProvider>{children}</AuthProvider>;
}
