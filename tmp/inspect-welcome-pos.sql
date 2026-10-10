select id,name,price,category,is_available,show_pos from public.menu_items where lower(name) like '%cheesecake%' or lower(category) like '%promo%';
