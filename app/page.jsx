import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { ArrowRight, Utensils, CalendarDays } from "lucide-react";
import styles from "./Home.module.css";

const drink = "https://images.jujabrewandbites.com/Biscoff%20Foam%20Latte.png";
const tea = "https://images.jujabrewandbites.com/Black%20Pearl%20Milk%20Tea.png";
const pasta = "https://images.jujabrewandbites.com/Truffle%20Cream%20Pasta.png";
const croffle = "https://images.jujabrewandbites.com/Biscoff%20Croffle.png";

export default function Home() {
  return <div className={styles.home}>
    <PublicNav active="home" />
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>JUJA BREW &amp; BITES / QUEZON CITY <span /></p>
          <h1><strong>Annyeong!</strong><br />Welcome to<br /><span>JUJA Brew &amp; Bites!</span></h1>
          <p className={styles.tagline}>Your next go-to place.</p>
          <p className={styles.intro}>Coffee, milk tea, and your favorite bites.<br />Drop by for a little everyday comfort,<br />or bring everyone together for a special occasion.</p>
          <div className={styles.actions}>
            <Link href="/menu"><Utensils size={19} />Explore the menu<ArrowRight size={20} /></Link>
            <Link href="/function-room"><CalendarDays size={19} />Book a function room</Link>
          </div>
        </div>
        <div className={styles.collage} aria-label="JUJA drinks and food">
          <span className={styles.note}>See you at JUJA! ♡</span>
          <img className={styles.mascot} src="https://images.jujabrewandbites.com/juja%204.png" alt="JUJA mascot" />
          <img className={styles.drink} src={drink} alt="JUJA Biscoff Foam Latte" />
          <img className={styles.tea} src={tea} alt="JUJA Black Pearl Milk Tea" />
          <img className={styles.pasta} src={pasta} alt="JUJA Truffle Cream Pasta" />
          <img className={styles.croffle} src={croffle} alt="JUJA Biscoff Croffle" />
        </div>
      </section>
      <section className={styles.cards} aria-label="Discover JUJA">
        <Link href="/menu" className={styles.card}>
          <div className={styles.productPhoto}><img src={drink} alt="Biscoff Foam Latte" loading="lazy" /></div>
          <div><span>01 / BREW &amp; BITES</span><h2>Find your favorite</h2><p>Milk tea, coffee, ice cream, chicken, waffles, sandwiches, and rice in a box.</p><i><ArrowRight size={20} /></i></div>
        </Link>
        <Link href="/function-room" className={styles.card}>
          <div className={styles.roomPhoto}><img src="/home/function-room.jpg" alt="JUJA function room with seating and a celebration setup" loading="lazy" /></div>
          <div><span>02 / GET TOGETHER</span><h2>Make room for memories</h2><p>Explore our function room and check availability for your next gathering.</p><i><ArrowRight size={20} /></i></div>
        </Link>
        <Link href="/event-cart" className={styles.card}>
          <div className={styles.cartPhoto}><img src="/images/event-cart-milk-tea.jpg" alt="JUJA event cart with umbrella and coffee equipment" loading="lazy" /></div>
          <div><span>03 / CELEBRATE</span><h2>Bring JUJA to your event</h2><p>Discover event cart packages for your next celebration.</p><i><ArrowRight size={20} /></i></div>
        </Link>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
