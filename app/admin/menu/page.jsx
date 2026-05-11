"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function MenuAdminPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  // MODAL STATE
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    category: "",
    price: "",
    description: "",
    image_url: "",
    is_available: true,
    is_featured: false,
  });

  const [optionGroups, setOptionGroups] = useState([]);

  const hasVariants = optionGroups.length > 0;

  useEffect(() => {
    fetchData();
  }, []);

  // -----------------------------
  // FETCH DATA (ITEMS + OPTIONS)
  // -----------------------------
  async function fetchData() {
    setLoading(true);

    const [itemRes, catRes, optRes] = await Promise.all([
      supabase.from("menu_items").select("*").order("name"),
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_item_options").select("*"),
    ]);

    if (itemRes.data) setItems(itemRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (optRes.data) setOptions(optRes.data);

    setLoading(false);
  }

  // -----------------------------
  // OPEN MODAL
  // -----------------------------
  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);

      setForm({
        name: item.name || "",
        category: item.category || "",
        price: item.price || "",
        description: item.description || "",
        image_url: item.image_url || "",
        is_available: item.is_available,
        is_featured: item.is_featured,
      });

      const itemOptions = options.filter((o) => o.menu_item_id === item.id);

      const grouped = {};
      itemOptions.forEach((opt) => {
        if (!grouped[opt.group_name]) {
          grouped[opt.group_name] = [];
        }
        grouped[opt.group_name].push(opt);
      });

      const formatted = Object.keys(grouped).map((key) => ({
        id: Date.now() + Math.random(),
        name: key,
        isRequired: true,
        isMultiSelect: false,
        options: grouped[key].map((o) => ({
          id: o.id,
          name: o.option_name,
          price: o.price_add_on,
        })),
      }));

      setOptionGroups(formatted);
    } else {
      setEditingItem(null);
      setForm({
        name: "",
        category: categories[0]?.name || "",
        price: "",
        description: "",
        image_url: "",
        is_available: true,
        is_featured: false,
      });
      setOptionGroups([]);
    }

    setIsModalOpen(true);
  };

  // -----------------------------
  // SAVE ITEM (FULL FIXED CRUD)
  // -----------------------------
  const handleSave = async () => {
    setSaving(true);

    try {
      let itemId = editingItem?.id;

      const payload = {
        name: form.name,
        category: form.category,
        price: hasVariants ? 0 : parseFloat(form.price || 0),
        description: form.description,
        image_url: form.image_url,
        is_available: form.is_available,
        is_featured: form.is_featured,
      };

      // CREATE / UPDATE ITEM
      if (editingItem) {
        await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", editingItem.id);
      } else {
        const { data } = await supabase
          .from("menu_items")
          .insert(payload)
          .select()
          .single();

        itemId = data.id;
      }

      // DELETE OLD OPTIONS
      await supabase
        .from("menu_item_options")
        .delete()
        .eq("menu_item_id", itemId);

      // INSERT NEW OPTIONS
      const optionPayload = optionGroups.flatMap((group) =>
        group.options.map((opt) => ({
          menu_item_id: itemId,
          group_name: group.name,
          option_name: opt.name,
          price_add_on: parseFloat(opt.price || 0),
        }))
      );

      if (optionPayload.length > 0) {
        await supabase.from("menu_item_options").insert(optionPayload);
      }

      await fetchData();
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Error saving item");
    }

    setSaving(false);
  };

  // -----------------------------
  // DELETE ITEM
  // -----------------------------
  const deleteItem = async (item) => {
    await supabase
      .from("menu_item_options")
      .delete()
      .eq("menu_item_id", item.id);

    await supabase.from("menu_items").delete().eq("id", item.id);

    fetchData();
  };

  // -----------------------------
  // FILTERED ITEMS
  // -----------------------------
  const filteredItems = items
    .filter((i) => catFilter === "All" || i.category === catFilter)
    .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading)
    return (
      <div className="p-10 flex justify-center">
        Loading...
      </div>
    );

  return (
    <div className="p-6">

      {/* HEADER */}
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Menu CRUD Admin</h1>

        <button
          onClick={() => openModal()}
          className="bg-pink-500 text-white px-4 py-2 rounded"
        >
          + Add Item
        </button>
      </div>

      {/* SEARCH */}
      <input
        className="border p-2 mb-4 w-full"
        placeholder="Search..."
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* LIST */}
      <div className="grid gap-3">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="border p-3 flex justify-between"
          >
            <div>
              <b>{item.name}</b>
              <p>₱{item.price}</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => openModal(item)}>Edit</button>
              <button onClick={() => deleteItem(item)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 w-[500px]">

            <h2 className="text-xl mb-4">
              {editingItem ? "Edit Item" : "New Item"}
            </h2>

            <input
              placeholder="Name"
              className="border p-2 w-full mb-2"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
            />

            <input
              placeholder="Price"
              className="border p-2 w-full mb-2"
              value={form.price}
              onChange={(e) =>
                setForm({ ...form, price: e.target.value })
              }
            />

            <select
              className="border p-2 w-full mb-2"
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
            >
              {categories.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>

            <textarea
              placeholder="Description"
              className="border p-2 w-full mb-2"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-pink-500 text-white px-4 py-2"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}