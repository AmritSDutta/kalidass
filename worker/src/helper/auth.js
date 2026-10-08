import {createHash, timingSafeEqual} from "node:crypto";
import {createRemoteJWKSet, jwtVerify} from "jose";

export class AuthHelper {
  static _jwks = null;
  static _jwksDomain = "";
  static _userinfoCache = new Map();

  static getJWKS(domain) {
    if (!AuthHelper._jwks || AuthHelper._jwksDomain !== domain) {
      AuthHelper._jwksDomain = domain;
      AuthHelper._jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    }
    return AuthHelper._jwks;
  }

  static async getUserInfo(domain, accessToken) {
    if (!domain || !accessToken) return null;
    const cached = AuthHelper._userinfoCache.get(accessToken);
    if (cached && Date.now() < cached.expires) {
      return cached.data;
    }

    try {
      const response = await fetch(`https://${domain}/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        AuthHelper._userinfoCache.set(accessToken, {data, expires: Date.now() + 5 * 60 * 1000});
        if (AuthHelper._userinfoCache.size > 200) {
          const firstKey = AuthHelper._userinfoCache.keys().next().value;
          AuthHelper._userinfoCache.delete(firstKey);
        }
        return data;
      }
    } catch (err) {
      console.warn("Auth0 UserInfo fetch error:", err.message);
    }

    return null;
  }

  static matchesAdminToken(candidate, env) {
    if (!candidate || !env?.ADMIN_TOKEN) return false;
    const target = String(env.ADMIN_TOKEN).trim().replace(/^["']|["']$/g, "").trim();
    const input = String(candidate).trim().replace(/^["']|["']$/g, "").trim();
    if (!target || !input) return false;

    const hashTarget = createHash("sha256").update(target).digest();
    const hashInput = createHash("sha256").update(input).digest();
    return timingSafeEqual(hashTarget, hashInput);
  }

  static async getAuthUser(request, env) {
    const auth = request.headers.get("authorization") || "";
    let token = "";
    if (auth.startsWith("Bearer ")) {
      token = auth.slice(7).trim();
    }

    const elevationToken = (request.headers.get("x-admin-token") || "").trim();
    if (!token && elevationToken && AuthHelper.matchesAdminToken(elevationToken, env)) {
      token = elevationToken;
    }

    if (!token) return null;

    const adminEmails = (env?.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const primaryAdminEmail = adminEmails[0] || "admin";

    // 1. Super-Admin secret token match (M2M scripts and standalone admin token mode)
    if (AuthHelper.matchesAdminToken(token, env)) {
      return {
        sub: "admin",
        email: primaryAdminEmail,
        name: "Super Admin",
        avatar: "",
        role: "admin",
        isSuperuserEligible: true,
      };
    }

    // 2. Auth0 JWT verification
    if (env?.AUTH0_DOMAIN) {
      try {
        const jwks = AuthHelper.getJWKS(env.AUTH0_DOMAIN);
        const options = {
          issuer: `https://${env.AUTH0_DOMAIN}/`,
        };
        if (env.AUTH0_AUDIENCE) {
          options.audience = env.AUTH0_AUDIENCE;
        }
        const {payload} = await jwtVerify(token, jwks, options);
        let rawEmail = typeof payload.email === "string" ? payload.email : "";
        if (!rawEmail) {
          const emailClaimKey = Object.keys(payload).find((k) => k.endsWith("/email"));
          if (emailClaimKey && typeof payload[emailClaimKey] === "string") {
            rawEmail = payload[emailClaimKey];
          }
        }

        let rawName = typeof payload.name === "string" ? payload.name : "";
        let rawPicture = typeof payload.picture === "string" ? payload.picture : "";

        // If email or profile is missing from JWT access token claims, query Auth0 UserInfo
        if ((!rawEmail || !rawName || !rawPicture) && env.AUTH0_DOMAIN) {
          const userinfo = await AuthHelper.getUserInfo(env.AUTH0_DOMAIN, token);
          if (userinfo) {
            if (!rawEmail && typeof userinfo.email === "string") {
              rawEmail = userinfo.email;
            }
            if (!rawName && (userinfo.name || userinfo.nickname)) {
              rawName = userinfo.name || userinfo.nickname;
            }
            if (!rawPicture && typeof userinfo.picture === "string") {
              rawPicture = userinfo.picture;
            }
          }
        }

        const email = rawEmail.trim().toLowerCase();

        let customRoles = [];
        if (Array.isArray(payload.roles)) {
          customRoles = payload.roles;
        } else {
          const rolesClaimKey = Object.keys(payload).find((k) => k.endsWith("/roles"));
          if (rolesClaimKey && Array.isArray(payload[rolesClaimKey])) {
            customRoles = payload[rolesClaimKey];
          }
        }

        const isSuperuserEligible =
          Boolean(email && adminEmails.includes(email)) ||
          customRoles.includes("admin") ||
          payload.role === "admin";

        // Step-up elevation check via x-admin-token header
        const elevationToken = (request.headers.get("x-admin-token") || "").trim();
        const isElevated = AuthHelper.matchesAdminToken(elevationToken, env);

        return {
          sub: payload.sub,
          email,
          name: rawName || payload.nickname || email || "Author",
          avatar: rawPicture || "",
          role: isElevated ? "admin" : "author",
          isSuperuserEligible,
        };
      } catch (err) {
        console.warn("Auth0 JWT verification error:", err.message);
        return null;
      }
    }

    return null;
  }
}
