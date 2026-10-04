import React, {useState, useRef, useEffect} from "react";
import Link from "@docusaurus/Link";
import {useAuth} from "@site/src/lib/auth";
import styles from "./AuthNavbarItem.module.css";

export default function AuthNavbarItem(): React.JSX.Element | null {
  const {user, isAuthenticated, isAdmin, isLoading, isAuth0Configured, loginWithAuth0, logout} =
    useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (isLoading) {
    return null;
  }

  // Unauthenticated State
  if (!isAuthenticated) {
    if (!isAuth0Configured) {
      return null;
    }

    return (
      <div className={styles.container}>
        <button
          type="button"
          className={styles.loginButton}
          onClick={loginWithAuth0}
          aria-label="Sign in to Kalidass Journal">
          Sign In
        </button>
      </div>
    );
  }

  // Authenticated State with User Profile Dropdown
  const displayName = user?.name || user?.email?.split("@")[0] || "Author";
  const initial = (user?.name || user?.email || "U")[0].toUpperCase();

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={`${styles.profileButton} ${isOpen ? styles.profileButtonActive : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`User menu for ${displayName}`}>
        {user?.avatar ? (
          <img src={user.avatar} alt="" className={styles.avatarImg} />
        ) : (
          <span className={styles.avatarInitials}>{initial}</span>
        )}
        <span className={styles.displayName}>{displayName}</span>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownName}>{user?.name || "Author"}</span>
            <span className={styles.dropdownEmail}>{user?.email || "admin@kalidass.local"}</span>
            <span className={isAdmin ? styles.badgeAdmin : styles.badgeAuthor}>
              {isAdmin ? "Super Admin" : "Author"}
            </span>
          </div>

          <div className={styles.divider} />

          <Link
            to="/admin"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setIsOpen(false)}>
            ✍️ Studio CMS
          </Link>
          <Link
            to="/admin?mode=compose"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setIsOpen(false)}>
            📝 New Story
          </Link>
          <Link
            to="/admin?mode=drafts"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setIsOpen(false)}>
            📑 My Drafts
          </Link>
          {isAdmin && (
            <Link
              to="/admin?mode=published"
              className={styles.menuItem}
              role="menuitem"
              onClick={() => setIsOpen(false)}>
              🌐 Published Index
            </Link>
          )}

          <div className={styles.divider} />

          <button
            type="button"
            className={styles.logoutItem}
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              logout();
            }}>
            🚪 Sign out
          </button>
        </div>
      )}
    </div>
  );
}
