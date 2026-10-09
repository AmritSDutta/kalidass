import React from "react";
import clsx from "clsx";

export default function NeuralGenNavbarItem({
  mobile,
  className,
}: {
  mobile?: boolean;
  className?: string;
}): React.JSX.Element {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If opening in a new tab/window via modifier keys, allow native browser behavior
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    // Force a full-page HTTP reload so Cloudflare Access intercepts the request
    e.preventDefault();
    window.location.href = "/generate_article";
  };

  return (
    <a
      href="/generate_article"
      className={clsx(
        mobile ? "menu__link" : "navbar__item navbar__link",
        className
      )}
      onClick={handleClick}
    >
      Neural Gen
    </a>
  );
}
