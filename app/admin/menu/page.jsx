"use client";
import AvailabilityToggle from "@/components/AvailabilityToggle";

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
const visibilityFields = (entry = {}) => ({ show_public: entry.show_public ?? (!entry.pos_only && !entry.hide_public), show_customer: entry.show_customer ?? !entry.pos_only, show_pos: entry.show_pos ?? true });
function MenuVisibilitySelection({ value, onChange }) {
  return <fieldset className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-3"><legend className="px-1 text-xs font-semibold text-slate-600">Show in</legend>
    {["public", "customer", "pos"].map((channel) => <label key={channel} className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-700"><input type="checkbox" checked={visibilityFields(value)[`show_${channel}`]} onChange={(event) => onChange({ ...value, ...visibilityFields(value), [`show_${channel}`]: event.target.checked })} />{channel}</label>)}
  </fieldset>;
}

function normalizeMaxSelection(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 1 ? Math.floor(numberValue) : null;
}

function optionalPriceValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeOptionForSave(option) {
  return {
    ...option,
    price: optionalPriceValue(option.price) ?? 0,
    grab_price: optionalPriceValue(option.grab_price),
    panda_price: optionalPriceValue(option.panda_price),
  };
}

export default function MenuAdminPage() {
  const [items, setItems] = useState([]);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [itemStoreAvailability, setItemStoreAvailability] = useState([]);
  const [categoryStoreAvailability, setCategoryStoreAvailability] = useState([]);
  const [storeAvailability, setStoreAvailability] = useState({});
  const [categoryAvailability, setCategoryAvailability] = useState({});
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  // Item Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("Details");
  const [editingItem, setEditingItem] = useState(null);

  // ✅ ADD: pos_only to item form
  const [form, setForm] = useState({
    name: "",
    category: "",
    price: "",
    description: "",
    image_url: "",
    is_available: true,
    is_featured: false,
    pos_only: false, ...visibilityFields(),
    grab_price: "",
    panda_price: "",
    grab_available: true,
    panda_available: true,
  });

  const [optionGroups, setOptionGroups] = useState([]);
  const [groupTemplates, setGroupTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const hasVariants = optionGroups.length > 0;
  const [saving, setSaving] = useState(false);

  // Category Modal State
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catForm, setCatForm] = useState({
    name: "",
    is_active: true,
    pos_only: false, ...visibilityFields(),
    discount_entitlement_group: "",
  });
  const [catSaving, setCatSaving] = useState(false);

  // Custom Delete Modal State
  const [itemToDelete, setItemToDelete] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const [itemRes, catRes, templateRes, storeRes, availabilityRes, categoryAvailabilityRes] = await Promise.all([
      supabase.from("menu_items").select("*").order("name"),
      supabase.from("menu_categories").select("*").order("name", { ascending: true }),
      supabase.from("option_group_templates").select("*").order("name"),
      supabase.from("stores").select("id, name, is_active").eq("is_active", true).order("name"),
      supabase.from("menu_item_store_availability").select("item_id, store_id, is_available"),
      supabase.from("menu_category_store_availability").select("category_id, store_id, is_available"),
    ]);

    if (itemRes.data) setItems(itemRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (templateRes.data) setGroupTemplates(templateRes.data);
    if (storeRes.data) setStores(storeRes.data);
    if (availabilityRes.error) {
      setAvailabilityNotice("Run the new Supabase SQL setup to save store availability per item.");
      setItemStoreAvailability([]);
    } else {
      setAvailabilityNotice("");
      setItemStoreAvailability(availabilityRes.data || []);
    }
    setCategoryStoreAvailability(categoryAvailabilityRes.error ? [] : categoryAvailabilityRes.data || []);

    setLoading(false);
  }

  // --- ITEM HANDLERS ---
  const openModal = (item = null) => {
    setModalTab("Details");

    if (item) {
      setEditingItem(item);
      const nextStoreAvailability = {};
      stores.forEach((store) => {
        const row = itemStoreAvailability.find(
          (entry) => String(entry.item_id) === String(item.id) && String(entry.store_id) === String(store.id)
        );
        nextStoreAvailability[store.id] = row ? row.is_available !== false : true;
      });
      setStoreAvailability(nextStoreAvailability);

      // ✅ ADD: pos_only prefill
      setForm({
        name: item.name || "",
        category: item.category || "",
        price: item.price ?? "",
        description: item.description || "",
        image_url: item.image_url || "",
        is_available: item.is_available !== false,
        is_featured: !!item.is_featured,
        pos_only: !!item.pos_only, ...visibilityFields(item),
        grab_price: item.grab_price ?? "",
        panda_price: item.panda_price ?? "",
        grab_available: item.grab_available !== false,
        panda_available: item.panda_available !== false,
      });

      setOptionGroups(
        (item.variants || []).map((group) => ({
          ...group,
          maxSelection: group.maxSelection ?? group.max_selection ?? "",
          posOnly: !!group.posOnly,
          hidePublic: !!group.hidePublic,
        }))
      );
    } else {
      setEditingItem(null);
      setStoreAvailability(Object.fromEntries(stores.map((store) => [store.id, true])));

      // ✅ ADD: pos_only default false
      setForm({
        name: "",
        category: categories.length > 0 ? categories[0].name : "",
        price: "",
        description: "",
        image_url: "",
        is_available: true,
        is_featured: false,
        pos_only: false, ...visibilityFields(),
        grab_price: "",
        panda_price: "",
        grab_available: true,
        panda_available: true,
      });

      setOptionGroups([]);
    }

    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!form.name.trim() || !form.category || form.price === "") {
      alert("Please ensure Name, Category, and Price are filled out.");
      return;
    }

    setSaving(true);
    try {
      const finalPayload = {
        ...form, ...visibilityFields(form), pos_only: !visibilityFields(form).show_public && !visibilityFields(form).show_customer,
        price: parseFloat(form.price) || 0,
        grab_price: form.grab_price === "" || form.grab_price == null ? null : parseFloat(form.grab_price) || 0,
        panda_price: form.panda_price === "" || form.panda_price == null ? null : parseFloat(form.panda_price) || 0,
        grab_available: form.grab_available !== false,
        panda_available: form.panda_available !== false,
        variants: optionGroups.map((group) => ({
          ...group,
          posOnly: !!group.posOnly,
          hidePublic: !!group.hidePublic,
          maxSelection: group.isMultiSelect ? normalizeMaxSelection(group.maxSelection ?? group.max_selection) : null,
          options: (group.options || []).map(normalizeOptionForSave),
        })),
      };

      let responseError = null;
      let savedItemId = editingItem?.id;

      if (editingItem) {
        const { error } = await supabase
          .from("menu_items")
          .update(finalPayload)
          .eq("id", editingItem.id);
        responseError = error;
      } else {
        const { data, error } = await supabase.from("menu_items").insert([finalPayload]).select("id").maybeSingle();
        responseError = error;
        savedItemId = data?.id;
      }

      if (responseError) throw responseError;
      if (savedItemId && stores.length > 0) {
        const rows = stores.map((store) => ({
          item_id: String(savedItemId),
          store_id: String(store.id),
          is_available: storeAvailability[store.id] !== false,
          updated_at: new Date().toISOString(),
        }));
        const { error: availabilityError } = await supabase
          .from("menu_item_store_availability")
          .upsert(rows, { onConflict: "item_id,store_id" });
        if (availabilityError) throw availabilityError;
      }

      await fetchData();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Save Error:", error);
      alert("Error saving item: " + (error.message || JSON.stringify(error)));
    } finally {
      setSaving(false);
    }
  };

  async function toggleAvailability(item) {
    if (availabilityBusy) return;
    setAvailabilityBusy(true);
    try {
      const available = item.is_available === false;
      const { error } = await supabase.from("menu_items").update({ is_available: available }).eq("id", item.id);
      if (error) throw error;
      setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, is_available: available } : row));
    } catch (error) { alert(error.message); }
    finally { setAvailabilityBusy(false); }
  }

  // --- DELETE HANDLERS ---
  const confirmDeleteItem = (item) => setItemToDelete(item);

  const executeDeleteItem = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", itemToDelete.id);
      if (error) throw error;
      await supabase.from("menu_item_store_availability").delete().eq("item_id", String(itemToDelete.id));
      await fetchData();
      setItemToDelete(null);
    } catch (err) {
      alert("Error deleting item: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDeleteCategory = (cat) => setCategoryToDelete(cat);

  const executeDeleteCategory = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("menu_categories").delete().eq("id", categoryToDelete.id);
      if (error) throw error;

      if (catFilter === categoryToDelete.name) setCatFilter("All");
      await fetchData();
      setCategoryToDelete(null);
    } catch (err) {
      alert("Error deleting category: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // --- VARIANT / OPTION HANDLERS ---
  const addOptionGroup = () => {
    setEditingTemplate({ id: null });
    setTemplateForm({ name: "", is_required: false, is_multi_select: false, max_selection: "", pos_only: false, hide_public: false, ...visibilityFields(), options: [{ id: crypto.randomUUID(), name: "", price: 0, grab_price: "", panda_price: "" }] });
  };
  const removeOptionGroup = (groupId) => setOptionGroups(optionGroups.filter((group) => group.id !== groupId));

  const updateTemplate = async () => {
    if (templateSaving) return;
    setTemplateSaving(true);
    try {
      const payload = {
        name: templateForm.name.trim(), is_required: templateForm.is_required, is_multi_select: templateForm.is_multi_select,
        max_selection: templateForm.is_multi_select ? normalizeMaxSelection(templateForm.max_selection) : null,
        ...visibilityFields(templateForm), pos_only: !visibilityFields(templateForm).show_public && !visibilityFields(templateForm).show_customer, hide_public: !visibilityFields(templateForm).show_public,
        options: (templateForm.options || []).map(normalizeOptionForSave),
      };
      if (!payload.name || !payload.options.length || payload.options.some((option) => !String(option.name || "").trim())) throw new Error("Enter a template name and named options.");
      const query = editingTemplate.id
        ? supabase.from("option_group_templates").update(payload).eq("id", editingTemplate.id)
        : supabase.from("option_group_templates").insert([payload]);
      const { data: saved, error } = await query.select().single();
      if (error) throw error;

      setOptionGroups((groups) => groups.map((group) => String(group.templateId) === String(saved.id) ? {
        ...group, ...visibilityFields(saved), name: saved.name, isRequired: saved.is_required, isMultiSelect: saved.is_multi_select,
        maxSelection: saved.max_selection, posOnly: saved.pos_only, hidePublic: saved.hide_public, options: saved.options,
      } : group));
      alert("Template saved. All attached menu items are synchronized.");
      setEditingTemplate(null);
      setTemplateForm(null);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally { setTemplateSaving(false); }
  };

  const deleteTemplate = async (id) => {
    if (!confirm("Delete this template?")) return;

    try {
      const { error } = await supabase.from("option_group_templates").delete().eq("id", id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  // --- CATEGORY HANDLERS ---
  const openCategoryModal = (cat = null) => {
    if (cat) {
      setEditingCategory(cat);
      const nextCategoryAvailability = {};
      stores.forEach((store) => {
        const row = categoryStoreAvailability.find(
          (entry) => String(entry.category_id) === String(cat.id) && String(entry.store_id) === String(store.id)
        );
        nextCategoryAvailability[store.id] = row ? row.is_available !== false : true;
      });
      setCategoryAvailability(nextCategoryAvailability);
      setCatForm({
        name: cat.name,
        is_active: cat.is_active,
        pos_only: !!cat.pos_only, ...visibilityFields(cat),
        discount_entitlement_group: cat.discount_entitlement_group || "",
      });
    } else {
      setEditingCategory(null);
      setCategoryAvailability(Object.fromEntries(stores.map((store) => [store.id, true])));
      setCatForm({ name: "", is_active: true, pos_only: false, ...visibilityFields(), discount_entitlement_group: "" });
    }
    setIsCatModalOpen(true);
  };

  const handleCategorySave = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) return alert("Category name is required.");
    const categoryPayload = {
      ...catForm, ...visibilityFields(catForm), pos_only: !visibilityFields(catForm).show_public && !visibilityFields(catForm).show_customer,
      name: catForm.name.trim(),
      discount_entitlement_group: catForm.discount_entitlement_group || null,
    };

    setCatSaving(true);
    try {
      if (editingCategory) {
        const { error } = await supabase.from("menu_categories").update(categoryPayload).eq("id", editingCategory.id);
        if (error) throw error;
        await saveCategoryStoreAvailability(editingCategory.id);

        if (editingCategory.name !== catForm.name) {
          await supabase.from("menu_items").update({ category: catForm.name }).eq("category", editingCategory.name);
          if (catFilter === editingCategory.name) setCatFilter(catForm.name);
        }
      } else {
        const { data, error } = await supabase.from("menu_categories").insert([categoryPayload]).select("id").maybeSingle();
        if (error) throw error;
        if (data?.id) await saveCategoryStoreAvailability(data.id);
      }

      await fetchData();
      setIsCatModalOpen(false);
    } catch (error) {
      console.error("Category Save Error:", error);
      alert("Error saving category: " + error.message);
    } finally {
      setCatSaving(false);
    }
  };

  async function saveCategoryStoreAvailability(categoryId) {
    if (!categoryId || stores.length === 0) return;
    const rows = stores.map((store) => ({
      category_id: String(categoryId),
      store_id: String(store.id),
      is_available: categoryAvailability[store.id] !== false,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("menu_category_store_availability")
      .upsert(rows, { onConflict: "category_id,store_id" });
    if (error) throw error;
  }

  const filteredItems = items
    .filter((i) => catFilter === "All" || i.category === catFilter)
    .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading)
    return (
      <div className="p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-sky-200 border-t-[#5b7288] animate-spin rounded-full" />
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-24 px-3 md:px-8" style={{ fontFamily: "'Arial', sans-serif" }}>
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-6 mb-4 md:mb-8 pt-4 md:pt-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-normal text-slate-800 leading-none">Menu Builder</h1>
          <p className="text-slate-500 text-xs md:text-sm font-medium mt-1 md:mt-2">
            {items.length} exquisite items • {categories.length} categories
          </p>
        </div>
        <div className="flex w-full md:w-auto gap-2 md:gap-3">
          <button
            onClick={() => openModal()}
            className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-white text-white text-[11px] md:text-sm font-normal uppercase rounded-xl md:rounded-2xl hover:bg-sky-500 transition-all shadow-[0_4px_15px_rgba(252,104,125,0.25)] hover:-translate-y-0.5 active:scale-95"
          >
            + Add Item
          </button>
          <button
            onClick={() => openCategoryModal()}
            className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3.5 bg-white border border-slate-200 text-slate-700 text-[11px] md:text-sm font-normal uppercase rounded-xl md:rounded-2xl hover:bg-sky-50 transition-all shadow-sm active:scale-95"
          >
            + Category
          </button>
        </div>
      </header>

      {/* SEARCH BAR & CATEGORY DROPDOWN (Mobile Only) */}
      <div className="lg:hidden flex flex-col gap-3 mb-6">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search menu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-100 rounded-xl text-xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all shadow-sm"
          />
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="w-full h-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all shadow-sm"
            >
              <option value="All">All Items ({items.length})</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name} ({items.filter((i) => i.category === cat.name).length})
                </option>
              ))}
            </select>
          </div>

          {/* Mobile Category Edit/Delete */}
          {catFilter !== "All" && (
            <div className="flex gap-2 flex-shrink-0 animate-in fade-in duration-200">
              <button
                onClick={() => openCategoryModal(categories.find((c) => c.name === catFilter))}
                className="w-11 h-11 flex items-center justify-center bg-white border border-slate-100 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-sky-50 transition-colors shadow-sm text-sm"
              >
                ✎
              </button>
              <button
                onClick={() => confirmDeleteCategory(categories.find((c) => c.name === catFilter))}
                className="w-11 h-11 flex items-center justify-center bg-white border border-slate-100 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm text-sm"
              >
                🗑
              </button>
            </div>
          )}
        </div>
      </div>

      {availabilityNotice ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
          {availabilityNotice}
        </div>
      ) : null}

      <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
        {/* RESPONSIVE CATEGORY NAVIGATION (Desktop) */}
        <div className="hidden lg:block w-72 flex-shrink-0">
          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
            <input
              type="text"
              placeholder="Search menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all shadow-sm"
            />
          </div>

          <div className="flex flex-col bg-white p-2 rounded-2xl border border-slate-100 shadow-sm gap-1">
            <h3 className="text-[10px] font-normal uppercase text-slate-500 px-3 pt-2 pb-2">Categories</h3>

            <button
              onClick={() => setCatFilter("All")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-normal uppercase transition-all duration-300 active:scale-95 ${
                catFilter === "All" ? "bg-slate-300/78 text-white shadow-sm" : "bg-transparent text-slate-500 hover:bg-slate-50 border-transparent"
              }`}
            >
              <span className="text-left break-words whitespace-normal leading-tight pr-2">All Items</span>
              <span className={`flex-shrink-0 flex px-2 py-0.5 rounded-full text-[9px] ${catFilter === "All" ? "bg-white/20" : "bg-slate-100"}`}>{items.length}</span>
            </button>

            {categories.map((cat) => (
              <div key={cat.id} className="relative group w-full flex items-center">
                <button
                  onClick={() => setCatFilter(cat.name)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-normal uppercase transition-all duration-300 active:scale-95 ${
                    catFilter === cat.name ? "bg-blue-300/50 text-white shadow-sm shadow-sky-200" : "bg-transparent text-slate-500 hover:bg-slate-50 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 pr-2">
                    <span className="text-left break-words whitespace-normal leading-tight">{cat.name}</span>

                    {/* Optional Category badge */}
                    {(
                      <span className="text-[9px] font-bold uppercase text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {["public", "customer", "pos"].filter((channel) => visibilityFields(cat)[`show_${channel}`]).join(" / ").toUpperCase() || "HIDDEN"}
                      </span>
                    )}
                  </div>

                  <span className={`flex-shrink-0 flex px-2 py-0.5 rounded-full text-[9px] ${catFilter === cat.name ? "bg-white/20" : "bg-slate-100"}`}>
                    {items.filter((i) => i.category === cat.name).length}
                  </span>
                </button>

                {/* Desktop Category Edit/Delete Hover Menu */}
                <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-slate-100 pointer-events-none group-hover:pointer-events-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openCategoryModal(cat);
                    }}
                    className="w-6 h-6 flex items-center justify-center bg-slate-50 hover:bg-sky-50 text-slate-500 hover:text-slate-700 rounded-md text-[11px] transition-colors"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDeleteCategory(cat);
                    }}
                    className="w-6 h-6 flex items-center justify-center bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-md text-[11px] transition-colors"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* LIST AREA */}
        <div className="flex-1 flex flex-col gap-3 md:gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl md:rounded-2xl border border-sky-50 shadow-sm p-3 md:p-4 pr-3 md:pr-5 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-0 hover:shadow-md transition-all duration-300 group cursor-default"
            >
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-lg md:rounded-xl bg-[#f0f7fb] flex items-center justify-center relative overflow-hidden flex-shrink-0 border border-sky-50">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <img src="/branding/juja-menu-fallback.png" alt="JUJA Brew & Bites" loading="lazy" className="h-full w-full bg-white object-contain" />
                  )}
                </div>

                <div>
                  <h3 className="font-normal text-slate-800 text-sm md:text-base mb-0.5 leading-tight">
                    {item.name}

                    {item.variants?.length > 0 && (
                      <span className="ml-1 text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded uppercase font-bold">
                        Variants
                      </span>
                    )}

                    {/* ✅ Item channel visibility */}
                    {(
                      <span className="ml-1 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase font-bold">
                        {["public", "customer", "pos"].filter((channel) => visibilityFields(item)[`show_${channel}`]).join(" / ").toUpperCase() || "HIDDEN"}
                      </span>
                    )}
                  </h3>

                  <div className="flex items-center gap-2">
                    <span className="font-normal text-slate-700 text-xs md:text-sm">₱{item.price}</span>
                    <span className="text-slate-200 text-[10px]">•</span>
                    <span className="text-[9px] md:text-[10px] font-normal uppercase text-slate-500">{item.category}</span>
                    {stores.length > 0 && (
                      <span className="text-[9px] md:text-[10px] font-normal uppercase text-cyan-700">
                        {stores.filter((store) => {
                          const row = itemStoreAvailability.find(
                            (entry) => String(entry.item_id) === String(item.id) && String(entry.store_id) === String(store.id)
                          );
                          return row ? row.is_available !== false : true;
                        }).length}/{stores.length} stores
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-3 md:gap-6 pt-3 md:pt-0 border-t md:border-none border-slate-50">
                <AvailabilityToggle available={item.is_available !== false} busy={availabilityBusy} name={item.name} scope="Global default" onChange={() => toggleAvailability(item)} />

                <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                  <button
                    onClick={() => openModal(item)}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-slate-50 border border-slate-100 text-[10px] md:text-xs font-normal text-slate-500 hover:text-slate-700 hover:bg-sky-50 rounded-lg md:rounded-xl transition-all active:scale-90"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => confirmDeleteItem(item)}
                    className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-slate-50 border border-slate-100 text-[10px] md:text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg md:rounded-xl transition-all active:scale-90"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="text-center py-12 md:py-20 text-slate-500 font-normal uppercase text-[10px] md:text-xs border border-dashed border-slate-200/60 rounded-xl md:rounded-2xl bg-white/50">
              No items found
            </div>
          )}
        </div>
      </div>

      {/* ─── CUSTOM DELETE MODALS ─── */}
      {(itemToDelete || categoryToDelete) && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-sm rounded-[24px] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-sm border border-red-100">
              🗑️
            </div>

            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">Delete {itemToDelete ? "Item" : "Category"}?</h3>

            <p className="text-sm text-slate-500 text-center mb-6 leading-relaxed">
              {itemToDelete
                ? `Are you sure you want to permanently delete "${itemToDelete.name}"? This action cannot be undone.`
                : `Are you sure you want to delete "${categoryToDelete.name}"? Items inside this category will NOT be deleted, but they will lose their category filter.`}
            </p>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setItemToDelete(null);
                  setCategoryToDelete(null);
                }}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-xs uppercase"
              >
                Cancel
              </button>

              <button
                onClick={itemToDelete ? executeDeleteItem : executeDeleteCategory}
                disabled={isDeleting}
                className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-md shadow-red-200 transition-colors disabled:opacity-70 text-xs uppercase active:scale-95"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD/EDIT CATEGORY MODAL ─── */}
      {isCatModalOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300"
          onClick={() => setIsCatModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-[24px] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl md:text-2xl font-bold text-slate-800">
                {editingCategory ? "Edit Category" : "Add Category"}
              </h3>
              <button
                onClick={() => setIsCatModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCategorySave} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rice Meals"
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">
                  Beneficiary Discount Daily Entitlement
                </label>
                <select
                  value={catForm.discount_entitlement_group || ""}
                  onChange={(e) => setCatForm({ ...catForm, discount_entitlement_group: e.target.value || null })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all"
                >
                  <option value="">Not eligible</option>
                  <option value="drink">Drink</option>
                  <option value="food">Food</option>
                  <option value="dessert">Dessert</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">A beneficiary may redeem one item from each eligible group per Manila business day.</p>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={catForm.is_active}
                      onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })}
                      className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:border-sky-500 checked:bg-slate-600 transition-all cursor-pointer"
                    />
                    <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xs font-bold">✓</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700">Active / Visible</span>
                </label>
              </div>

              <MenuVisibilitySelection value={catForm} onChange={setCatForm} />

              <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-800">Store Availability</p>
                    <p className="mt-1 text-xs text-slate-500">Unchecked stores will not show this category in that store&apos;s customer menu.</p>
                  </div>
                  {stores.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCategoryAvailability(Object.fromEntries(stores.map((store) => [store.id, true])))}
                      className="rounded-lg border border-cyan-200 bg-white/80 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-800"
                    >
                      All Stores
                    </button>
                  )}
                </div>
                {stores.length === 0 ? (
                  <p className="text-xs text-slate-500">No active stores found.</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {stores.map((store) => (
                      <label key={store.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white bg-white/85 p-3">
                        <input
                          type="checkbox"
                          checked={categoryAvailability[store.id] !== false}
                          onChange={(e) =>
                            setCategoryAvailability((current) => ({
                              ...current,
                              [store.id]: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 accent-cyan-600"
                        />
                        <span className="text-xs font-medium text-slate-700">{store.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="w-full py-3.5 rounded-xl bg-slate-50 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catSaving}
                  className="w-full py-3.5 rounded-xl bg-blue-300/50 text-white font-bold text-xs hover:bg-blue-400/50 transition-all shadow-md shadow-slate-200 disabled:opacity-70 active:scale-95"
                >
                  {catSaving ? "Saving..." : editingCategory ? "Update Category" : "Add Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPLATE EDIT MODAL */}
      {editingTemplate && templateForm && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">{editingTemplate.id ? "Edit Template" : "Create Template"}</h3>
              <button
                onClick={() => {
                  setEditingTemplate(null);
                  setTemplateForm(null);
                }}
                className="text-slate-500 hover:text-black"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Template name"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
              />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={templateForm.is_required}
                  onChange={(e) => setTemplateForm({ ...templateForm, is_required: e.target.checked })}
                />
                Required
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={templateForm.is_multi_select}
                  onChange={(e) => setTemplateForm({ ...templateForm, is_multi_select: e.target.checked, max_selection: e.target.checked ? templateForm.max_selection : "" })}
                />
                Multi Select
              </label>

              {templateForm.is_multi_select && (
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Max selections
                  <input
                    type="number"
                    min="1"
                    value={templateForm.max_selection || ""}
                    onChange={(e) => setTemplateForm({ ...templateForm, max_selection: e.target.value })}
                    placeholder="Blank = unlimited"
                    className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 text-sm normal-case tracking-normal text-slate-800"
                  />
                </label>
              )}

              <MenuVisibilitySelection value={templateForm} onChange={setTemplateForm} />

              <div className="space-y-3">
                {templateForm.options.map((opt, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_100px_100px_100px]">
                    <input
                      value={opt.name}
                      onChange={(e) => {
                        const updated = [...templateForm.options];
                        updated[idx].name = e.target.value;
                        setTemplateForm({ ...templateForm, options: updated });
                      }}
                      placeholder="Option name"
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    />

                    <input
                      type="number"
                      value={opt.price}
                      onChange={(e) => {
                        const updated = [...templateForm.options];
                        updated[idx].price = e.target.value;
                        setTemplateForm({ ...templateForm, options: updated });
                      }}
                      placeholder="Price"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={opt.grab_price ?? ""}
                      onChange={(e) => {
                        const updated = [...templateForm.options];
                        updated[idx].grab_price = e.target.value;
                        setTemplateForm({ ...templateForm, options: updated });
                      }}
                      placeholder="GRAB"
                      className="border border-cyan-100 bg-cyan-50/40 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={opt.panda_price ?? ""}
                      onChange={(e) => {
                        const updated = [...templateForm.options];
                        updated[idx].panda_price = e.target.value;
                        setTemplateForm({ ...templateForm, options: updated });
                      }}
                      placeholder="PANDA"
                      className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm"
                    />
                    <button type="button" onClick={() => setTemplateForm((current) => ({ ...current, options: current.options.filter((_, optionIndex) => optionIndex !== idx) }))} className="text-xs text-red-600">Remove option</button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setTemplateForm({
                    ...templateForm,
                    options: [...templateForm.options, { id: crypto.randomUUID(), name: "", price: 0, grab_price: "", panda_price: "" }],
                  })
                }
                className="text-xs font-bold text-slate-700"
              >
                + Add Option
              </button>

              <button type="button" disabled={templateSaving} onClick={updateTemplate} className="w-full py-3 rounded-xl bg-slate-600 text-white font-bold text-sm">
                {templateSaving ? "Saving…" : "Save Template & Sync Items"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD/EDIT ITEM MODAL ─── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 transition-all duration-300"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl rounded-t-[20px] md:rounded-[24px] p-5 md:p-8 shadow-2xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:zoom-in-95 duration-300 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 md:hidden flex-shrink-0" />

            <div className="flex justify-between items-center mb-5 md:mb-6 flex-shrink-0">
              <h3 className="text-xl md:text-2xl font-bold text-slate-800">{editingItem ? "Edit Item" : "New Item"}</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Premium Tabs */}
            <div className="flex gap-1 md:gap-2 mb-5 md:mb-6 bg-slate-50 p-1 rounded-xl w-fit border border-slate-100 flex-shrink-0">
              <button
                onClick={() => setModalTab("Details")}
                className={`px-4 md:px-5 py-2 rounded-lg text-[10px] md:text-xs font-bold flex items-center gap-1.5 transition-all duration-300 ${
                  modalTab === "Details" ? "bg-sky-50 text-slate-700 shadow-sm border border-slate-200" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <span className="text-xs md:text-sm">📝</span> Details
              </button>

              <button
                onClick={() => setModalTab("Option Groups")}
                className={`px-4 md:px-5 py-2 rounded-lg text-[10px] md:text-xs font-bold flex items-center gap-1.5 transition-all duration-300 ${
                  modalTab === "Option Groups" ? "bg-sky-50 text-slate-700 shadow-sm border border-slate-200" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <span className="text-xs md:text-sm">⚙️</span> Variants & Options {hasVariants && `(${optionGroups.length})`}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto hide-scrollbar -mx-2 px-2 pb-4">
              {modalTab === "Details" ? (
                <form id="item-form" onSubmit={handleSave} className="space-y-4 md:space-y-5 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Item Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:gap-5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Category *</label>
                      <select
                        required
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all appearance-none cursor-pointer"
                      >
                        <option value="">— Select Category —</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Base Price (₱) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={form.price}
                        placeholder="0.00"
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all"
                      />
                      <p className="mt-1.5 text-[10px] text-slate-500">
                        Base price stays editable even when required variants are enabled.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Description</label>
                    <textarea
                      rows="2"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Product Image URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/image.jpg"
                      value={form.image_url}
                      onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 text-xs md:text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all"
                    />
                  </div>

                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={form.is_available}
                          onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
                          className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:border-sky-500 checked:bg-slate-600 transition-all cursor-pointer"
                        />
                        <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xs font-bold">✓</span>
                      </div>
                      <span className="text-xs md:text-sm font-medium text-slate-700">Available to Order</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={form.is_featured}
                          onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                          className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-md checked:border-sky-500 checked:bg-slate-600 transition-all cursor-pointer"
                        />
                        <span className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xs font-bold">✓</span>
                      </div>
                      <span className="text-xs md:text-sm font-medium text-slate-700">Featured Item ⭐️</span>
                    </label>

                    {/* Channel visibility */}
                    <MenuVisibilitySelection value={form} onChange={setForm} />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">POS Channel Pricing</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Normal tables, takeout, function room, and web orders use the base price. GRAB/PANDA can override price or hide the item in POS only.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <label className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-slate-700">Show in GRAB</span>
                          <input
                            type="checkbox"
                            checked={form.grab_available !== false}
                            onChange={(e) => setForm({ ...form, grab_available: e.target.checked })}
                            className="h-4 w-4 accent-cyan-700"
                          />
                        </label>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          GRAB Price
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.grab_price}
                            placeholder="Blank = base price"
                            onChange={(e) => setForm({ ...form, grab_price: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none transition focus:border-sky-500"
                          />
                        </label>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <label className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-slate-700">Show in PANDA</span>
                          <input
                            type="checkbox"
                            checked={form.panda_available !== false}
                            onChange={(e) => setForm({ ...form, panda_available: e.target.checked })}
                            className="h-4 w-4 accent-cyan-700"
                          />
                        </label>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          PANDA Price
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.panda_price}
                            placeholder="Blank = base price"
                            onChange={(e) => setForm({ ...form, panda_price: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none transition focus:border-sky-500"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-800">Store Availability</p>
                        <p className="mt-1 text-xs text-slate-500">Unchecked stores will not show this item in that store&apos;s customer menu.</p>
                      </div>
                      {stores.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setStoreAvailability(Object.fromEntries(stores.map((store) => [store.id, true])))}
                          className="rounded-lg border border-cyan-200 bg-white/80 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-800"
                        >
                          All Stores
                        </button>
                      )}
                    </div>
                    {stores.length === 0 ? (
                      <p className="text-xs text-slate-500">No active stores found.</p>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {stores.map((store) => (
                          <label key={store.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white bg-white/85 p-3">
                            <input
                              type="checkbox"
                              checked={storeAvailability[store.id] !== false}
                              onChange={(e) =>
                                setStoreAvailability((current) => ({
                                  ...current,
                                  [store.id]: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 accent-cyan-600"
                            />
                            <span className="text-xs font-medium text-slate-700">{store.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </form>
              ) : (
                <div className="flex flex-col h-full animate-in fade-in duration-300 pb-2">
                  <p className="text-xs text-slate-500 mb-5 font-medium leading-relaxed px-1">
                    Changes in Saved Templates update every attached item. Group 1 can be used for <strong className="text-slate-700">Variants</strong> (e.g. Regular/Spicy). The item base price remains editable on the Details tab.
                  </p>

                  <button
                    type="button"
                    onClick={addOptionGroup}
                    className="w-full py-3.5 md:py-4 border-2 border-dashed border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-sky-50 hover:border-sky-200 transition-all mb-6 active:scale-95"
                  >
                    + Create Saved Template
                  </button>

                  <div className="mb-5">
                    <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Add From Template</label>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const selected = groupTemplates.find((g) => String(g.id) === e.target.value);
                        if (!selected) return;

                        setOptionGroups((prev) => [
                          ...prev,
                          {
                            id: Date.now(),
                            templateId: selected.id,
                            ...visibilityFields(selected),
                            name: selected.name,
                            isRequired: selected.is_required,
                            isMultiSelect: selected.is_multi_select,
                            maxSelection: selected.max_selection || "",
                            posOnly: !!selected.pos_only,
                            hidePublic: !!selected.hide_public,
                            options: selected.options.map((opt) => ({
                              id: Date.now() + Math.random(),
                              name: opt.name,
                              price: opt.price,
                              grab_price: opt.grab_price ?? "",
                              panda_price: opt.panda_price ?? "",
                            })),
                          },
                        ]);

                        e.target.value = "";
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs md:text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-slate-200 transition-all"
                    >
                      <option value="">Select Option Group Template</option>
                      {groupTemplates.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} — {(group.options || []).map((option) => `${option.name}: ₱${option.price || 0}`).join(", ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-6 border border-slate-200 rounded-2xl p-4 bg-slate-50">
                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">Saved Templates</h4>

                    <div className="space-y-2">
                      {groupTemplates.map((template) => (
                        <div key={template.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3 py-2">
                          <div>
                            <p className="text-xs font-bold text-slate-700">{template.name}</p><p className="text-[10px] text-slate-500">{(template.options || []).map((option) => `${option.name}: ₱${option.price || 0}`).join(" · ")}</p>
                            <p className="text-[10px] text-slate-500">{template.options?.length || 0} options · {items.filter((item) => (item.variants || []).some((group) => String(group.templateId) === String(template.id))).length} linked items</p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTemplate(template);
                                setTemplateForm({
                                  ...visibilityFields(template),
                                  name: template.name,
                                  is_required: template.is_required,
                                  is_multi_select: template.is_multi_select,
                                  max_selection: template.max_selection || "",
                                  pos_only: !!template.pos_only,
                                  hide_public: !!template.hide_public,
                                  options: template.options || [],
                                });
                              }}
                              className="text-[10px] font-bold text-blue-500 hover:text-blue-700"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteTemplate(template.id)}
                              className="text-[10px] font-bold text-red-500 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {optionGroups.map((group) => <div key={group.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">{group.name}</h4><p className="text-xs text-slate-500">Linked template · Edit in Saved Templates above</p></div>
                        <button type="button" onClick={() => removeOptionGroup(group.id)} className="rounded-lg border px-3 py-2 text-xs">Remove from item</button></div>
                      <p className="mt-2 text-xs text-slate-600">{group.options.map((option) => `${option.name} (₱${Number(option.price || 0).toFixed(2)})`).join(" · ")}</p>
                    </div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex-shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-3 md:py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-all active:scale-95"
                >
                  Cancel
                </button>

                <button
                  onClick={handleSave}
                  form="item-form"
                  disabled={saving}
                  className="w-full py-3 md:py-3.5 rounded-xl bg-blue-300/50 text-white font-bold text-xs hover:bg-blue-400/50 transition-all shadow-md shadow-slate-200 disabled:opacity-70 active:scale-95"
                >
                  {saving ? "Saving..." : "Save Menu Item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
