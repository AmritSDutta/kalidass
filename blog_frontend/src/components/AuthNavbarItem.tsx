import React, {useState, useRef, useEffect} from "react";
import Link from "@docusaurus/Link";
import {useAuth} from "@site/src/lib/auth";
import styles from "./AuthNavbarItem.module.css";

export default function AuthNavbarItem({mobile}: {mobile?: boolean}): React.JSX.Element | null {
  const {
    user,
    isAuthenticated,
    isAdmin,
    isSuperuserEligible,
    isLoading,
    isAuth0Configured,
    loginWithAuth0,
    logout,
    elevateToSuperuser,
    dropSuperuser,
  } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [showElevationModal, setShowElevationModal] = useState(false);
  const [elevationInput, setElevationInput] = useState("");
  const [elevationError, setElevationError] = useState("");
  const [elevationBusy, setElevationBusy] = useState(false);
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

  const handleElevateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setElevationError("");
    setElevationBusy(true);
    const candidate = elevationInput.trim();
    if (!candidate) {
      setElevationError("Please enter the admin passphrase.");
      setElevationBusy(false);
      return;
    }

    const success = await elevateToSuperuser(candidate);
    setElevationBusy(false);
    if (success) {
      setShowElevationModal(false);
      setElevationInput("");
      setIsOpen(false);
    } else {
      setElevationError("Invalid superuser credentials. Please try again.");
    }
  };

  if (isLoading) {
    return null;
  }

  // Unauthenticated State — Always render Sign In button
  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        {isAuth0Configured ? (
          <button
            type="button"
            className={styles.loginButton}
            onClick={loginWithAuth0}
            aria-label="Sign in to Kalidass Journal">
            Sign In
          </button>
        ) : (
          <Link
            to="/admin"
            className={styles.loginButton}
            aria-label="Sign in to Studio">
            Sign In
          </Link>
        )}
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
            <span className={styles.dropdownEmail}>{user?.email || ""}</span>
            <span className={isAdmin ? styles.badgeAdmin : styles.badgeAuthor}>
              {isAdmin ? "Super Admin" : "Author"}
            </span>
          </div>

          {/* Sudo Elevation Section: Available only for authors whose email is in ADMIN_EMAILS */}
          {!isAdmin && isSuperuserEligible && (
            <>
              <div className={styles.divider} />
              <button
                type="button"
                className={styles.elevateButton}
                onClick={() => {
                  setIsOpen(false);
                  setShowElevationModal(true);
                }}>
                ⚡ Login as Superuser
              </button>
            </>
          )}

          {isAdmin && (
            <>
              <div className={styles.divider} />
              <div className={styles.elevatedSection}>
                <span className={styles.elevatedTag}>🛡️ Superuser Active</span>
                <button
                  type="button"
                  className={styles.dropButton}
                  onClick={() => {
                    dropSuperuser();
                    setIsOpen(false);
                  }}>
                  Exit Superuser
                </button>
              </div>
            </>
          )}

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

      {/* Elevation Passphrase Modal */}
      {showElevationModal && (
        <div className={styles.modalOverlay} onClick={() => setShowElevationModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}>⚡</span>
              <h3 className={styles.modalTitle}>Superuser Elevation</h3>
            </div>
            <p className={styles.modalDesc}>
              Enter your administrative passphrase to elevate your session and unlock superuser privileges across all briefs and drafts.
            </p>
            <form onSubmit={handleElevateSubmit}>
              <input
                type="password"
                className={styles.modalInput}
                placeholder="Enter ADMIN_TOKEN"
                value={elevationInput}
                onChange={(e) => setElevationInput(e.target.value)}
                autoFocus
                required
              />
              {elevationError && <p className={styles.modalError}>{elevationError}</p>}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowElevationModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.confirmBtn}
                  disabled={elevationBusy}>
                  {elevationBusy ? "Verifying..." : "Elevate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
