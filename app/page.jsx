import Link from "next/link";
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
          <h1>Annyeong!<br />Welcome to JUJA Brew &amp; Bites!<br /><em>Your next go-to place.</em></h1>
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
