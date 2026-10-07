import React from "react";
import styles from "./KalidasaEpigraph.module.css";

export default function KalidasaEpigraph(): React.JSX.Element {
  return (
    <section className={styles.wrapper} aria-label="Kalidasa Epigraph">
      <div className={styles.card}>
        <div className={styles.glow} />
        <div className={styles.header}>
          <span className={styles.badge}>Mālavikāgnimitra // Act 1, Verse 2</span>
          <span className={styles.source}>Prologue by Kalidasa</span>
        </div>
        <blockquote className={styles.quote}>
          <p className={styles.sanskrit}>
            पुराणमित्येव न साधु सर्वं न चापि काव्यं नवमित्यवद्यम्।
            <br />
            सन्तः परीक्ष्यान्यतरद्भजन्ते मूढः परप्रत्ययनेयबुद्धिः॥
          </p>
        </blockquote>
        <div className={styles.divider} />
        <div className={styles.translation}>
          <span className={styles.translationLabel}>Translation &amp; Meaning:</span>
          <p className={styles.translationText}>
            &ldquo;Everything is not good simply because it is old, nor is a creation flawed merely
            because it is new. The wise examine with an open, discerning mind and accept what is
            genuinely worthy, while the foolish are blindly guided by the opinions of others.&rdquo;
          </p>
        </div>
      </div>
    </section>
  );
}
