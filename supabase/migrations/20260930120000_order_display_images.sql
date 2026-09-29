create table public.order_display_images (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url like 'https://%'),
  sort_order integer not null default 1000,
  created_at timestamptz not null default now()
);
alter table public.order_display_images enable row level security;
grant select on public.order_display_images to anon, authenticated;
revoke insert, update, delete on public.order_display_images from anon, authenticated;
create policy "Read display playlist" on public.order_display_images for select to anon, authenticated using (true);
insert into public.order_display_images (url, sort_order) values
('https://images.jujabrewandbites.com/Cookies%20(1376%20x%20824%20px).jpg', 0),
('https://images.jujabrewandbites.com/TV_BENTO.png', 1),
('https://images.jujabrewandbites.com/TV_DUBAI%20CHEWY.png', 2),
('https://images.jujabrewandbites.com/TV_LOYALTY%202.png', 3),
('https://images.jujabrewandbites.com/TV_EGG%20BUBBLE.png', 4),
('https://images.jujabrewandbites.com/TV_FREE%20WIFI.png', 5),
('https://images.jujabrewandbites.com/TV_FRESH%20MANGO.png', 6),
('https://images.jujabrewandbites.com/TV_FUNCTION%20ROOM.png', 7),
('https://images.jujabrewandbites.com/TV_GREAT%20COFFEE.png', 8),
('https://images.jujabrewandbites.com/TV_KATSU.png', 9),
('https://images.jujabrewandbites.com/TV_MILK%20TEA.png', 10),
('https://images.jujabrewandbites.com/TV_MIN%20DONUT-COFFEE.png', 11),
('https://images.jujabrewandbites.com/TV_NO%20SMOKING.png', 12),
('https://images.jujabrewandbites.com/TV_LOYALTY.png', 13),
('https://images.jujabrewandbites.com/TV_NUTELLA%20MT.png', 14),
('https://images.jujabrewandbites.com/TV_PARFAIT.png', 15),
('https://images.jujabrewandbites.com/TV_PET%20FRIENDLY.png', 16),
('https://images.jujabrewandbites.com/TV_TAIWAN.png', 17),
('https://images.jujabrewandbites.com/TV_UNLI%20WINGS.png', 18);
