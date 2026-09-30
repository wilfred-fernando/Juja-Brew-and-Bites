"use client";

import { useState } from "react";
import styles from "./EventCart.module.css";
import { PublicNav as Nav } from "@/components/PublicNav";
import { PublicFooter as Footer } from "@/components/PublicFooter";



const coffeeFlavors = [
  "Spanish Latte",
  "Iced Latte",
  "Sea Salt Latte",
  "Caramel Macchiato",
  "White Mocha",
  "Mocha",
  "Americano",
];

const premiumCoffeeFlavors = [
  "Biscoff Latte",
  "Dirty Matcha Latte",
  "Sea Salt Spanish Latte",
  "Double Shot Latte",
  "Dark Mocha",
  "Vanilla Latte",
  "Hazelnut Latte",
];

const milkTeaFlavors = [
  "Black Pearl Milk Tea",
  "Panda Milk Tea",
  "Cheesecake Milk Tea",
  "Oreo Sea Salt Milk Tea",
  "Juja Trio Milk Tea",
  "Taro Milk Tea",
];

const premiumMilkTeaFlavors = [
  "Oreo Sea Salt Milk Tea",
  "Cheesecake Milk Tea",
  "Milo Dinosaur",
  "Brown Sugar Milk Tea",
  "Matcha Milk Tea",
  "Juja Trio Milk Tea",
];

const coffeePackages = [
  {
    name: "Coffee Starter Package",
    cups: "50 Cups",
    price: "₱9,499",
    meta: ["Good for 50 cups", "16oz iced coffee", "1.5 hours service time"],
    includes: [
      "Mobile coffee cart setup",
      "Custom cup stickers",
      "Choice of 3 coffee flavors",
      "Uniformed barista/service staff",
      "Cups, straws, ice, and complete serving supplies",
      "1 hour setup before event",
    ],
  },
  {
    name: "Coffee Package A",
    cups: "100 Cups",
    price: "₱16,999",
    meta: ["Good for 100 cups", "16oz iced coffee", "2 hours service time"],
    includes: [
      "Mobile coffee cart setup",
      "Custom cup stickers",
      "Choice of 4 coffee flavors",
      "Uniformed barista/service staff",
      "Cups, straws, ice, and complete serving supplies",
      "1 hour setup before event",
    ],
  },
  {
    name: "Coffee Package B",
    cups: "150 Cups",
    price: "₱23,999",
    meta: ["Good for 150 cups", "16oz iced coffee", "2 hours service time"],
    includes: [
      "Mobile coffee cart setup",
      "Custom cup stickers",
      "Choice of 5 coffee flavors",
      "Uniformed barista/service staff",
      "Cups, straws, ice, and complete serving supplies",
      "Free event menu display",
      "1 hour setup before event",
    ],
  },
  {
    name: "Coffee Package C",
    cups: "200 Cups",
    price: "₱30,999",
    meta: ["Good for 200 cups", "16oz iced coffee", "3 hours service time"],
    includes: [
      "Mobile coffee cart setup",
      "Custom cup stickers",
      "Choice of 6 coffee flavors",
      "2 uniformed service staff",
      "Cups, straws, ice, and complete serving supplies",
      "Free event menu display",
      "1 hour setup before event",
    ],
  },
];

const drinkPackages = [
  {
    group: "50 Cups Packages",
    description: "A compact event-cart experience for intimate celebrations and small gatherings.",
    items: [
      {
        name: "Starter Package A",
        label: "Classic Milk Tea 50",
        price: "₱8,499",
        meta: ["Good for 50 cups", "16oz drinks", "1.5 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 3 milk tea flavors",
          "Uniformed service staff",
          "Cups, straws, ice, sinkers, and serving supplies",
        ],
        flavors: milkTeaFlavors,
      },
      {
        name: "Starter Package B",
        label: "Premium Milk Tea 50",
        price: "₱9,999",
        meta: ["Good for 50 cups", "16oz premium drinks", "1.5 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 3 premium flavors",
          "Premium sinker options",
          "Uniformed service staff",
        ],
        flavors: premiumMilkTeaFlavors,
      },
      {
        name: "Starter Package C",
        label: "Milk Tea + Coffee 50",
        price: "₱10,499",
        meta: ["25 cups Milk Tea", "25 cups Iced Coffee", "1.5 hours service time"],
        includes: [
          "Choice of 2 milk tea flavors",
          "Choice of 2 coffee flavors",
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Uniformed service staff and serving supplies",
        ],
        flavors: coffeeFlavors,
      },
    ],
  },
  {
    group: "100 Cups Packages",
    items: [
      {
        name: "Package A",
        label: "Classic Milk Tea 100",
        price: "₱14,999",
        meta: ["Good for 100 cups", "16oz drinks", "2 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 4 milk tea flavors",
          "Uniformed service staff",
          "Cups, straws, ice, sinkers, and serving supplies",
        ],
        flavors: milkTeaFlavors,
      },
      {
        name: "Package B",
        label: "Premium Milk Tea 100",
        price: "₱17,999",
        meta: ["Good for 100 cups", "16oz premium drinks", "2 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 4 premium flavors",
          "Premium sinker options",
          "Uniformed service staff",
        ],
        flavors: premiumMilkTeaFlavors,
      },
      {
        name: "Package C",
        label: "Milk Tea + Coffee 100",
        price: "₱18,999",
        meta: ["50 cups Milk Tea", "50 cups Iced Coffee", "2 hours service time"],
        includes: [
          "Choice of 3 milk tea flavors",
          "Choice of 3 coffee flavors",
          "Mobile drink cart setup",
          "Custom cup stickers",
        ],
        flavors: coffeeFlavors,
      },
    ],
  },
  {
    group: "150 Cups Packages",
    items: [
      {
        name: "Package D",
        label: "Classic Milk Tea 150",
        price: "₱20,999",
        meta: ["Good for 150 cups", "16oz drinks", "2 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 5 milk tea flavors",
          "Uniformed service staff",
          "Complete serving supplies",
        ],
        flavors: milkTeaFlavors,
      },
      {
        name: "Package E",
        label: "Premium Milk Tea 150",
        price: "₱25,999",
        meta: ["Good for 150 cups", "16oz premium drinks", "2 hours service time"],
        includes: [
          "Choice of 5 premium flavors",
          "Premium sinkers",
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Free event menu display",
        ],
        flavors: premiumMilkTeaFlavors,
      },
      {
        name: "Package F",
        label: "Milk Tea + Coffee 150",
        price: "₱26,999",
        meta: ["75 cups Milk Tea", "75 cups Iced Coffee", "2 hours service time"],
        includes: [
          "Choice of 4 milk tea flavors",
          "Choice of 4 coffee flavors",
          "Mobile cart setup",
          "Custom cup stickers",
          "Free event menu display",
        ],
        flavors: coffeeFlavors,
      },
    ],
  },
  {
    group: "200 Cups Packages",
    items: [
      {
        name: "Package G",
        label: "Classic Milk Tea 200",
        price: "₱26,999",
        meta: ["Good for 200 cups", "16oz drinks", "3 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 6 milk tea flavors",
          "2 uniformed service staff",
          "Free event menu display",
          "Complete serving supplies",
        ],
        flavors: milkTeaFlavors,
      },
      {
        name: "Package H",
        label: "Premium Milk Tea 200",
        price: "₱33,999",
        meta: ["Good for 200 cups", "16oz premium drinks", "3 hours service time"],
        includes: [
          "Choice of 6 premium flavors",
          "Premium sinkers",
          "Custom cup stickers",
          "Mobile cart setup",
          "2 service staff",
          "Free event menu display",
        ],
        flavors: premiumMilkTeaFlavors,
      },
      {
        name: "Package I",
        label: "Milk Tea + Coffee 200",
        price: "₱34,999",
        meta: ["100 cups Milk Tea", "100 cups Iced Coffee", "3 hours service time"],
        includes: [
          "Choice of 5 milk tea flavors",
          "Choice of 5 coffee flavors",
          "Mobile drink cart setup",
          "Custom cup stickers",
          "2 service staff",
          "Free event menu display",
        ],
        flavors: coffeeFlavors,
      },
    ],
  },
];

const addOns = [
  "Classic Milk Tea additional cups: ₱130/cup",
  "Premium Milk Tea additional cups: ₱160/cup",
  "Coffee additional cups: ₱160/cup",
  "Premium coffee upgrade: ₱20 to ₱30/cup",
  "Extra service hour: ₱1,500/hour",
  "Additional barista: ₱1,000",
  "Premium sinkers: ₱500 to ₱1,000",
  "Custom event menu board: ₱500",
  "Coffee machine setup upgrade: ₱2,000",
  "Travel fee depends on event location",
];





function PackageCard({ pkg, category }) {
  return (
    <article className={styles.card}>
      <p className={styles.eyebrow}>{category}</p>
      <h3>{pkg.name}</h3>
      <p className={styles.price}>{pkg.price}</p>
      <div className={styles.meta}>{pkg.meta.map(item => <span key={item}>{item}</span>)}</div>
      <p className={styles.smallHeading}>Your package includes</p>
      <ul>{pkg.includes.map(item => <li key={item}>{item}</li>)}</ul>
      <details className={styles.flavors}>
        <summary>Explore the flavors</summary>
        <div className={styles.pills}>{(pkg.flavors || coffeeFlavors).map(item => <span key={item}>{item}</span>)}</div>
      </details>
      <a className={styles.cardLink} href="#inquire">Inquire about this package <span aria-hidden="true">↗</span></a>
    </article>
  );
}

export default function EventCartPage() {
  const [size, setSize] = useState(0);
  const selected = drinkPackages[size];
  return (
    <div className={styles.page}>
      <Nav active="event-cart" />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>JUJA / The event cart collection</p>
            <h1>A little JUJA.<br /><em>A memorable celebration.</em></h1>
            <p>Handcrafted coffee, refreshing milk tea, and crowd-favorite picapica. Bring your favorites to the moments worth celebrating.</p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#packages">Explore packages <span aria-hidden="true">↓</span></a>
              <a className={styles.heroLink} href="#inquire">Plan your event ↗</a>
            </div>
            <div className={styles.heroFacts}><span><strong>50–200</strong> drink cups</span><span><strong>16oz</strong> refreshments</span><span><strong>From ₱8,499</strong> drink packages</span></div>
          </div>
          <div className={styles.heroVisual}>
            <img src="/images/event-cart-milk-tea.jpg" alt="JUJA milk tea event cart package presentation" fetchPriority="high" />
            <div className={styles.imageCaption}><span>Made for your gathering</span><strong>Brewed. Served. Celebrated.</strong></div>
          </div>
        </section>
        <div className={styles.occasions}><span>A place at every celebration</span><p>Weddings · Birthdays · Corporate events · School events · Debuts · Family gatherings</p></div>
        <section id="packages" className={styles.section}>
          <div className={styles.sectionTop}><div><p className={styles.eyebrow}>01 / Find your perfect pour</p><h2>Good company. Great drinks.</h2></div><p>Choose your cup count, then find the package that fits your celebration.</p></div>
          <div className={styles.selector} role="group" aria-label="Package cup count">{[50,100,150,200].map((cups,index) => <button type="button" key={cups} aria-pressed={size === index} onClick={() => setSize(index)}>{cups} cups</button>)}</div>
          <p className={styles.groupDescription}>{selected.description}</p>
          <div className={styles.packageGrid}>
            <PackageCard pkg={coffeePackages[size]} category="Iced coffee" />
            {selected.items.map((pkg,index) => <PackageCard key={pkg.name} pkg={pkg} category={['Classic milk tea','Premium milk tea','Milk tea + coffee'][index]} />)}
          </div>
          <div className={styles.upgrade}><div><p className={styles.eyebrow}>Make it a little extra</p><h3>Premium coffee upgrade</h3><p>Add ₱2,000 to ₱4,000 depending on cup quantity.</p></div><div className={styles.pills}>{premiumCoffeeFlavors.map(flavor => <span key={flavor}>{flavor}</span>)}</div></div>
        </section>
        <section className={styles.snacks}>
          <img src="/images/event-cart-picapica.jpg" alt="JUJA picapica cart and snack package" loading="lazy" />
          <div><p className={styles.eyebrow}>02 / Something to share</p><h2>Little bites.<br />Big crowd pleaser.</h2><p>Complete the celebration with a picapica cart made for mingling, snacking, and coming back for more.</p><p className={styles.price}>₱9,999</p><div className={styles.snackFacts}><span>100 servings</span><span>2 hours</span><span>10 varieties to choose from</span></div><a className={styles.primary} href="#inquire">Ask about picapica ↗</a></div>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionTop}><div><p className={styles.eyebrow}>03 / The finishing touches</p><h2>Your event, your extras.</h2></div><p>Add more cups, more time, or a personal touch to your setup.</p></div>
          <div className={styles.addOns}>{addOns.map(item => { const [label,...value] = item.split(':'); return <div key={item}><span>{label}</span>{value.length > 0 && <strong>{value.join(':').trim()}</strong>}</div>; })}</div>
        </section>
        <section id="inquire" className={styles.inquiry}>
          <div><p className={styles.eyebrow}>Let’s celebrate together</p><h2>Bring JUJA to your next event.</h2><p>Tell us your event date, location, preferred package, and cup count. Our team will help you plan the details.</p></div>
          <div className={styles.contact}><a className={styles.primary} href="https://fb.com/jujabrewandbites" target="_blank" rel="noopener noreferrer">Message us on Facebook ↗</a><a className={styles.heroLink} href="tel:09399228383">Call 0939-922-8383</a><span>Travel fee depends on event location.</span></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
