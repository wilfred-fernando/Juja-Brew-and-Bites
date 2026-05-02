import { supabase } from '@/utils/supabase';

export const MenuCategory = {
  list: async () => {
    const { data, error } = await supabase
      .from('menu_categories')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    return data;
  },
  
  create: async (payload) => {
    const { data, error } = await supabase
      .from('menu_categories')
      .insert([payload])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  },

  update: async (id, payload) => {
    const { data, error } = await supabase
      .from('menu_categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  },

  delete: async (id) => {
    const { error } = await supabase
      .from('menu_categories')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  }
};

export const MenuItem = {
  list: async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*');
      
    if (error) throw error;
    return data;
  },

  filter: async (filters) => {
    let query = supabase.from('menu_items').select('*');
    
    // Dynamically apply filters (like { is_available: true, is_featured: true })
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  
  create: async (payload) => {
    const { data, error } = await supabase
      .from('menu_items')
      .insert([payload])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  },

  update: async (id, payload) => {
    const { data, error } = await supabase
      .from('menu_items')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  },

  delete: async (id) => {
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  }
};

export const Order = {
  list: async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  },

  create: async (payload) => {
    const { data, error } = await supabase
      .from('orders')
      .insert([payload])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  },
  
  update: async (id, payload) => {
    const { data, error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  }
};