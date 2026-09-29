import Link from "next/link";
import Image from "next/image";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import styles from "@/components/PublicPremium.module.css";

export default function Home() {
  return <div>
    <PublicNav active="home" />
    <main>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>JUJA BREW & BITES / QUEZON CITY</p>
          <h1 className={styles.welcomeTitle}>
            <span className={styles.greeting}>Annyeong!</span>
            <span className={styles.welcomeLine}>Welcome to</span>
            <span className={styles.welcomeLogo}><Image src="/branding/juja-signage.png" alt="JUJA Brew & Bites!" width={8640} height={2160} sizes="(max-width: 640px) 160vw, 850px" priority /></span>
          </h1>
          <p className={styles.welcomeTagline}>Your next go-to place.</p>
          <p className={styles.intro}>Coffee, milk tea, and your favorite bites. Drop by for a little everyday comfort, or bring everyone together for a special occasion.</p>
          <div className={styles.actions}><Link href="/menu">Explore the menu →</Link><Link href="/function-room">Book a function room</Link></div>
        </div>
        <div className={styles.visual}><img src="https://images.jujabrewandbites.com/juja%204.png" alt="JUJA mascot welcoming you" /></div>
      </section>
      <section className={styles.explore} aria-label="Discover JUJA">
        <Link href="/menu"><span>01 / BREW & BITES</span><h2>Find your favorite ↗</h2><p>Milk tea, coffee, ice cream, chicken, waffles, sandwiches, and rice in a box.</p></Link>
        <Link href="/function-room"><span>02 / GET TOGETHER</span><h2>Make room for memories ↗</h2><p>Explore our function room and check availability for your next gathering.</p></Link>
        <Link href="/event-cart"><span>03 / CELEBRATE</span><h2>Bring JUJA to your event ↗</h2><p>Discover event cart packages for your next celebration.</p></Link>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
