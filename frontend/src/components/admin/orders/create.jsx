import moment from 'moment/moment';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useFormik } from "formik";
import { useDispatch, useSelector } from 'react-redux';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  Typography,
  Select,
  MenuItem,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { CreateProduct } from '../products/create';
import pdfMake from 'pdfmake/build/pdfmake';
import { generatePdfDefinition, generatePdfDefinition2 } from './helper';
import { Delete, Sync } from '@mui/icons-material';
import { fetchWeightsAction } from '../../../store/orders';
import { ProductType } from '../../../enums/product';

/* -------------------------
  Safe font loader for pdfMake
------------------------- */
try {
  const vfsFonts = require('pdfmake/build/vfs_fonts');
  if (vfsFonts?.pdfMake?.vfs) {
    pdfMake.vfs = vfsFonts.pdfMake.vfs;
  } else if (vfsFonts?.vfs) {
    pdfMake.vfs = vfsFonts.vfs;
  }
} catch (e) {
  console.warn('pdfMake fonts not loaded:', e);
}

/* -------------------------
  Utility + storage helpers
------------------------- */

const HIGHLIGHT_SX = {
  boxShadow: '0 0 0 3px #ffeb3b, 0 0 8px #ffe082',
  backgroundColor: '#fffde7',
  transition: 'all 0.15s'
};

const ORDER_SER_KEY = 'orderSeries_v1';
const INVOICES_KEY = 'invoices_v1';
const DAY_TOTAL_KEY = 'dayTotals_v1';

const getTodayStr = () => moment().format("DD-MM-YYYY");

const getStoredSeries = () => { try { const raw = localStorage.getItem(ORDER_SER_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; } };
const setStoredSeries = (obj) => { try { localStorage.setItem(ORDER_SER_KEY, JSON.stringify(obj)); } catch {} };
const generateStartForToday = () => Math.floor(Math.random() * 100000) * 10 + 1;
const nextOrderNumberForToday = () => {
  const t = getTodayStr();
  const d = getStoredSeries();
  if (d.date !== t || typeof d.last !== 'number') {
    const s = generateStartForToday();
    setStoredSeries({ date: t, last: s });
    return s;
  }
  const n = d.last + 1;
  setStoredSeries({ date: t, last: n });
  return n;
};

const getStoredDayTotal=()=>{ try{const raw=localStorage.getItem(DAY_TOTAL_KEY); return raw?JSON.parse(raw):{};}catch{return{}} };
const setStoredDayTotal=(o)=>{ try{localStorage.setItem(DAY_TOTAL_KEY,JSON.stringify(o));}catch{} };
const ensureTodayRecord=()=>{ const t=getTodayStr(); const d=getStoredDayTotal(); if(!d||d.date!==t){const p={date:t,total:0}; setStoredDayTotal(p); return 0;} return Number(d.total||0); };
const getTodayGrandTotal=()=>ensureTodayRecord();
const addToTodayGrandTotal=(amt)=>{ const t=getTodayStr(); const d=getStoredDayTotal(); const base=(d&&d.date===t)?Number(d.total||0):0; const total=base+Number(amt||0); setStoredDayTotal({date:t,total}); try{window.dispatchEvent(new CustomEvent('DAY_TOTAL_UPDATED',{detail:total}))}catch{}; return total; };
const subtractFromTodayGrandTotal=(amt)=>{ const t=getTodayStr(); const d=getStoredDayTotal(); const base=(d&&d.date===t)?Number(d.total||0):0; const total=Math.max(0,base-Number(amt||0)); setStoredDayTotal({date:t,total}); try{window.dispatchEvent(new CustomEvent('DAY_TOTAL_UPDATED',{detail:total}))}catch{}; return total; };
const msToNextMidnight=()=>{ const now=new Date(); const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,0); return next.getTime()-now.getTime(); };

const PENDING_INVOICES_KEY = 'pendingInvoices_v1';
const savePendingInvoice = (payload) => {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_INVOICES_KEY) || '[]');
    cur.push({ payload, ts: new Date().toISOString() });
    localStorage.setItem(PENDING_INVOICES_KEY, JSON.stringify(cur));
  } catch (e) {
    console.warn('savePendingInvoice failed', e);
  }
};

// Classify quick tags for your quick select
const classifyQuickTag = (raw) => {
  if (!raw) return '';
  const n = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hasKadi = /\b(kadi|kdi)\b/.test(n);
  const hasTiff = /\b(tiffin|tffn)\b/.test(n);
  if (/\bbt\s*tiffin\b/.test(n) || (hasKadi && hasTiff)) return 'kadi tiffin';
  if (/\bthali\b/.test(n) && /\bdelhi\b/.test(n)) return 'thali delhi';
  if (/\bdabba\b/.test(n)) return 'dabba';
  return '';
};

const safeGetProductName = (rowsObj, item) => {
  const row = rowsObj && item ? rowsObj[item.productId] : undefined;
  return (row && row.name) || item?.name || 'ITEM';
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Helper function to check if a price is in restricted ranges (200-209 or 301-309)
const isRestrictedPrice = (price) => {
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return false;
  return (numPrice >= 200 && numPrice <= 209) || (numPrice >= 301 && numPrice <= 309);
};
const sanitizeOrderForServer = (props) => {
  const { orderItems = [], ...rest } = props || {};
  const clean = orderItems.map((it) => {
    const { altName, ...cpy } = it || {};
    cpy.quantity = toNum(cpy.quantity);
    cpy.productPrice = toNum(cpy.productPrice);
    cpy.totalPrice = toNum(cpy.totalPrice);
    return cpy;
  });
  return {
    ...rest,
    subTotal: toNum(rest.subTotal),
    tax: toNum(rest.tax),
    taxPercent: toNum(rest.taxPercent),
    total: toNum(rest.total),
    orderItems: clean,
  };
};

/* -------------------------
  Minimal offline DB (self-contained)
------------------------- */
function toNumber(n){ const x = Number(n); return Number.isFinite(x) ? x : 0; }
function recomputeTotals(order) {
  const sub = (order.orderItems || []).reduce((s, it) => s + toNumber(it.totalPrice), 0);
  const tax = Math.round(sub * (toNumber(order.taxPercent) / 100));
  const total = sub + tax;
  return { subTotal: sub, tax, total };
}
function saveOrderLocal(orderProps) {
  // Ensure order number + standardize dates
  const localOrderNo = String(nextOrderNumberForToday());
  const base = { ...orderProps, orderNumber: localOrderNo, orderDate: getTodayStr() };

  // Normalize items and totals
  const orderItems = (base.orderItems || []).map(it => ({
    productId: it.productId || it.id || '',
    name: it.name || it.altName || '',
    quantity: toNumber(it.quantity),
    productPrice: toNumber(it.productPrice),
    totalPrice: toNumber(it.totalPrice),
    altName: (it.altName || '').trim(),
    type: it.type || ''
  }));

  const withItems = { ...base, orderItems };
  const totals = recomputeTotals(withItems);
  const finalObj = { ...withItems, ...totals };

  try {
    const cur = JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]');
    cur.push({ ...finalObj, savedAt: new Date().toISOString() });
    localStorage.setItem(INVOICES_KEY, JSON.stringify(cur));
    try {
      window.dispatchEvent(new CustomEvent('INVOICES_UPDATED'));
    } catch {}
  } catch (e) {
    console.warn('Failed to persist invoice locally', e);
  }
  return finalObj;
}

function loadAllInvoices() {
  try { return JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]'); } catch { return []; }
}
function computeDailyTotalsFromInvoices(invoices) {
  const byDate = {};
  invoices.forEach(inv => {
    const day =
      inv.orderDate &&
      /^\d{2}-\d{2}-\d{4}$/.test(inv.orderDate)
        ? inv.orderDate
        : moment(inv.savedAt).isValid()
          ? moment(inv.savedAt).format('DD-MM-YYYY')
          : getTodayStr();
    if (!byDate[day]) byDate[day] = { date: day, total: 0, count: 0 };
    byDate[day].total += toNumber(inv.total);
    byDate[day].count += 1;
  });
  // sort desc by date
  return Object.values(byDate).sort((a,b) => {
    const ma = moment(a.date, 'DD-MM-YYYY');
    const mb = moment(b.date, 'DD-MM-YYYY');
    if (!ma.isValid() && !mb.isValid()) return 0;
    if (!ma.isValid()) return 1;
    if (!mb.isValid()) return -1;
    return mb.valueOf() - ma.valueOf();
  });
}

/* -------------------------
  Component
------------------------- */

export const CreateOrder = () => {
  const dispatch = useDispatch();

  const rows = useSelector(
    state => state?.productState?.products?.rows || {},
    (a, b) => {
      if (a === b) return true;
      if (!a || !b) return false;
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      return keysA.length === keysB.length && keysA.every(k => a[k] === b[k]);
    }
  );
  
  const customers = useSelector(
    (s) => s?.applicationState?.customers || [],
    (a, b) => {
      if (a === b) return true;
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      return a.length === b.length && a.every((item, i) => item === b[i]);
    }
  );

  const customerOptions = useMemo(() => customers.map((c) => ({
    ...c,
    label: c?.name || c?.title || c?.mobile || 'Customer',
  })), [customers]);

  const productOptions = useMemo(() => (
    Object.keys(rows || {})?.map(id => ({
      label: (rows[id].name || '').toUpperCase(),
      productId: id,
      value: rows[id].name
    })) || []
  ), [rows]);

  const [pdfUrl, setPdfUrl] = useState('');
  const pdfRef = useRef(null);
  const firstDigitLockRef = useRef(null);
  const lastAddSucceededRef = useRef(false);

  // ref for modal price input to ensure focus works reliably
  const modalPriceRef = useRef(null);
  // ref for main productPrice input to focus after adding
  const priceInputRef = useRef(null);

  const [selectedQuick, setSelectedQuick] = useState('');
  const clearQuickHighlight = () => setSelectedQuick('');
  const [highlightedQuickProduct, setHighlightedQuickProduct] = useState(null);
  const quickVariant = (tag) => (selectedQuick === tag || highlightedQuickProduct === tag ? 'contained' : 'outlined');

  const [template, setTemplate] = useState(1);
  const TEMPLATE_MAP = useMemo(() => ({ 1: 2, 2: 1 }), []);

  const [archivedOrderProps, setArchivedOrderProps] = useState(null);
  const [archivedPdfUrl, setArchivedPdfUrl] = useState('');

  const [lastSubmitError, setLastSubmitError] = useState(null);
  const [lastSubmitResponse, setLastSubmitResponse] = useState(null);
  const [lastInvoiceTotal, setLastInvoiceTotal] = useState(null);

  const [suppressAutoSuggest, setSuppressAutoSuggest] = useState(false);

  // use suppressAutoSuggest in a small effect so eslint doesn't flag it as assigned but unused
  useEffect(() => {
    // intentionally referencing the state to silence unused variable warnings.
    // In future you can hook this state into product Autocomplete behavior (e.g. temporarily close suggestion list).
    if (suppressAutoSuggest) {
      // no-op for now
    }
  }, [suppressAutoSuggest]);

  const [dabbaLock, setDabbaLock] = useState(false);
  const [dabbaProductId, setDabbaProductId] = useState(null);
  const [bowlPriceLock, setBowlPriceLock] = useState(false);
  const [bowlProductIdLocked, setBowlProductIdLocked] = useState(null);

  const [fetchedViaScale, setFetchedViaScale] = useState(false);

  // Modal suppression state (if user explicitly closes modal for current price range)
  const [modalSuppress, setModalSuppress] = useState(false);

  // NEW: Past totals (history)
  const [dailyHistory, setDailyHistory] = useState([]);
  const refreshHistory = useCallback(() => {
    const inv = loadAllInvoices();
    setDailyHistory(computeDailyTotalsFromInvoices(inv));
  }, []);

  const printPdf = useCallback(() => {
    try {
      if (!pdfUrl && !archivedPdfUrl) return;
      const frame = pdfRef.current;
      if (frame && frame.contentWindow) { frame.contentWindow.focus(); frame.contentWindow.print(); return; }
      const w = window.open(archivedPdfUrl || pdfUrl);
      if (w) { const onLoad = () => { try { w.print(); } catch {} }; w.addEventListener('load', onLoad, { once: true }); }
    } catch {}
  }, [pdfUrl, archivedPdfUrl]);

  const generatePdf = useCallback((pdfProps) => {
    const updatedProps = JSON.parse(JSON.stringify(pdfProps));
    updatedProps.orderItems = updatedProps.orderItems?.map(item => ({
      name: (item.altName && item.altName.trim()) ? item.altName.trim() : safeGetProductName(rows, item),
      productPrice: item.productPrice,
      quantity: item.quantity,
      totalPrice: item.totalPrice
    })) ?? [];
    const chosen = TEMPLATE_MAP[template] ?? template;
    const pdfObject = chosen === 1 ? generatePdfDefinition(updatedProps) : generatePdfDefinition2(updatedProps);
    pdfMake.createPdf(pdfObject).getBlob((blob) => { const url = URL.createObjectURL(blob); setPdfUrl(url); });
  }, [rows, template, TEMPLATE_MAP]);

  const initialOrderProps = useMemo(() => ({
    customerName: "", 
    customerMobile: "",
    customer: null,
    notes: "",
    orderNumber: "ORD-XXXXXXXX",
    orderDate: moment().format("DD-MM-YYYY"),
    orderItems: [], 
    subTotal: 0, 
    tax: 0, 
    taxPercent: 0, 
    total: 0
  }), []);
  
  const [orderProps, setOrderProps] = useState(initialOrderProps);
  const orderItemsRef = useRef(orderProps.orderItems || []);
  useEffect(() => { orderItemsRef.current = orderProps.orderItems || []; }, [orderProps.orderItems]);

  const [todayGrandTotal, setTodayGrandTotal] = useState(getTodayGrandTotal());

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [inputValue, setInputValue] = useState('');

  function formikSafeGet(field) {
    try { return (formik && formik.values && formik.values[field]) || ""; } catch { return ""; }
  }

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: { id:"", type:"", name:"", altName:"", template:1, productPrice:"", quantity:0, totalPrice:0 },
    onSubmit: async (values) => {
      lastAddSucceededRef.current = false;

      try {
        const currentIsBowl = Boolean(values && (String(values.name || '').toLowerCase().includes('bowl') || (bowlProductIdLocked && String(values.id) === String(bowlProductIdLocked))));
        if (currentIsBowl || bowlPriceLock) {
          const valStr = String(values.productPrice || '').replace(/\D/g,'');
          if (valStr.length !== 3) { alert('Bowl price must be exactly 3 digits (100–399).'); return; }
          const numeric = Number(valStr);
          if (numeric < 100 || numeric > 399) { alert('Bowl price must be between 100 and 399.'); return; }
          values.productPrice = valStr;
        }
      } catch {}

      if (Number(values.quantity) <= 0) { alert("Cannot add product with zero quantity. Please fetch a valid weight."); return; }

      const priceNumLocal = Number(values?.productPrice) || 0;
      
      // For weighted products: enforce 3-digit price (100-399)
      const isWeightedProduct = (values?.type === ProductType.WEIGHTED || String(values?.type||'').toLowerCase()==='weighted');
      if (isWeightedProduct) {
        const priceStr = String(priceNumLocal);
        if (priceStr.length !== 3 || priceNumLocal < 100 || priceNumLocal > 399) {
          alert('Weighted product price must be exactly 3 digits (100-399).');
          return;
        }
      } else {
        if (priceNumLocal <= 0) { alert('Product price must be greater than 0.'); return; }
      }

      const price = Number(values?.productPrice) || 0;
      const qty = Number(values?.quantity) || 0;
      const lineTotal = Number((price * qty).toFixed(2));
      const subTotal = Number((orderProps.subTotal + lineTotal).toFixed(2));
      const tax = Number((subTotal * (orderProps.taxPercent / 100)).toFixed(2));
      const newItem = {
        subTotal, tax, total: subTotal + tax,
        orderItems: [...orderProps.orderItems, {
          productId: values.id,
          name: values.name,
          quantity: Number(values.quantity) || 0,
          productPrice: priceNumLocal,
          totalPrice: Number((((Number(values.productPrice)||0)*(Number(values.quantity)||0)).toFixed(2))),
          type: values.type,
          altName: (values.altName || '').trim()
        }]
      };

      setOrderProps((prevProps) => { 
        const np={...prevProps, ...newItem}; 
        try { generatePdf(np); } catch {}
        if (highlightedQuickProduct && values.name.toLowerCase().includes(highlightedQuickProduct)) {
          setHighlightedQuickProduct(null);
          clearQuickHighlight();
        }
        return np; 
      });

      lastAddSucceededRef.current = true;

      try {
        if (values?.id && bowlProductIdLocked && String(values.id) === String(bowlProductIdLocked)) {
          setBowlPriceLock(false);
          setBowlProductIdLocked(null);
        }
      } catch {}

      try {
        const added = Number((price * qty).toFixed(2));
        setLastInvoiceTotal(added);
      } catch {}

      formik.resetForm();
      setSelectedProduct(null);
      setInputValue('');
      try { setFetchedViaScale(false); } catch {}
      clearQuickHighlight();
    }
  });

  const isWeighted = (formik.values.type === ProductType.WEIGHTED || String(formik.values.type||'').toLowerCase()==='weighted');
  
  // For weighted products: validate 3-digit price
  const priceValue = Number(formikSafeGet('productPrice')) || 0;
  const priceStr = String(priceValue);
  const isWeightedPriceInvalid = Boolean(
    isWeighted && 
    (priceStr.length !== 3 || priceValue < 100 || priceValue > 399)
  );
  
  // Get price range for weighted products (e.g., 250 -> 200-299)
  const getPriceRange = (price) => {
    if (!isWeighted || !price) return '';
    const firstDigit = Math.floor(price / 100);
    const rangeStart = firstDigit * 100;
    const rangeEnd = rangeStart + 99;
    return `${rangeStart}-${rangeEnd}`;
  };
  
  const priceRange = getPriceRange(priceValue);
  
  const isNameAdd = !formik.values.id;
  const isWeightReadOnly = Boolean(isWeighted && fetchedViaScale);

  const weighingScaleHandler = useCallback(async () => {
    const { weight } = await dispatch(fetchWeightsAction());
    if (weight == null || Number(weight) <= 0) {
      alert("Weight fetched is zero or invalid. Please ensure the scale is ready.");
      return false;
    }
    formik.setFieldValue('quantity', weight);
    setFetchedViaScale(true);
    const price = Number(formik.values.productPrice) || 0;
    formik.setFieldValue('totalPrice', Number((price * weight).toFixed(2)));
    return true;
  }, [dispatch, formik]);

  // use stable classifyQuickTag from outer scope (remove inner duplicates)
  const onProductSelect = useCallback(async (e, value) => {
    if (dabbaLock && value && value.productId !== dabbaProductId) {
      alert('Product switching is locked because you selected dabba. Add the dabba product first.');
      return;
    }

    if (
      selectedProduct &&
      value?.productId !== selectedProduct?.productId &&
      formik.values.name &&
      (
        !orderItemsRef.current.some(item => item.productId === formik.values.id)
      )
    ) {
      const ok = window.confirm('Are you sure you want to change product? You have not added the current selection.');
      if (!ok) return;
    }

    const rawName = (rows && value && value.productId && rows[value.productId]?.name) ? rows[value.productId].name : (value?.label || value?.value || '');
    setSelectedQuick(classifyQuickTag(rawName));
    setSelectedProduct(value);

    if (value) {
      const { productId } = value;
      if (!rows || !productId || !rows[productId]) {
        formik.setFieldValue('id', productId ?? "");
        formik.setFieldValue('name', value?.value || "");
        formik.setFieldValue('type', "");
        formik.setFieldValue('productPrice', "");
        formik.setFieldValue('totalPrice', 0);
        setBowlPriceLock(false);
        setBowlProductIdLocked(null);
        setTimeout(() => clearQuickHighlight(), 100);
        return;
      }
      formik.setFieldValue('id', productId ?? "");
      formik.setFieldValue('name', rows[productId]?.name || "");
      formik.setFieldValue('type', rows[productId]?.type || "");
      const price = rows[productId]?.pricePerKg || 0;
      formik.setFieldValue('productPrice', price ? String(price) : "");
      try { firstDigitLockRef.current = (String(price || '') || '').charAt(0) || null; } catch {}
      formik.setFieldValue('totalPrice', Number((((price||0) * (Number(formik.values.quantity)||0))).toFixed(2)));

      const selectedType = rows[productId]?.type;
      const looksWeighted = (
        selectedType === ProductType.WEIGHTED ||
        String(selectedType || '').toLowerCase() === 'weighted' ||
        rows[productId]?.weighted === true ||
        String(rows[productId]?.unitType || '').toLowerCase() === 'weighted'
      );

      try {
        const lab = (rows[productId]?.name || '').toLowerCase();
        if ((lab || '').includes('bowl')) {
          const bp = Number(rows[productId]?.pricePerKg) || 0;
          if (bp >= 100 && bp <= 399) {
            setBowlPriceLock(true);
            setBowlProductIdLocked(productId);
            try { firstDigitLockRef.current = String(bp).charAt(0) || null; } catch {}
          } else {
            setBowlPriceLock(false);
            setBowlProductIdLocked(null);
          }
        } else {
          setBowlPriceLock(false);
          setBowlProductIdLocked(null);
        }
      } catch {}

      setFetchedViaScale(false);
      if (looksWeighted) {
        const success = await weighingScaleHandler();
        if (!success) {
          formik.resetForm();
          setSelectedProduct(null);
          setInputValue('');
          clearQuickHighlight();
          return;
        }
      }
      setTimeout(() => clearQuickHighlight(), 100);
    } else {
      formik.resetForm();
      setSelectedProduct(null);
      setInputValue('');
      try { setFetchedViaScale(false); } catch {}
      setBowlPriceLock(false);
      setBowlProductIdLocked(null);
      clearQuickHighlight();
    }
  }, [dabbaLock, dabbaProductId, selectedProduct, formik, rows, weighingScaleHandler]);

  const attemptProductChange = useCallback(async (value) => {
    if (dabbaLock && value && value.productId !== dabbaProductId) {
      alert('Product switching is locked because you selected dabba. Add the dabba product first.');
      return;
    }

    const currentlySelected = selectedProduct;
    const currentNameFilled = !!(formik.values.name);
    const currentNotAdded = !orderItemsRef.current.some(item => item.productId === formik.values.id);

    if (currentlySelected && value && value.productId !== currentlySelected.productId && currentNameFilled && currentNotAdded) {
      const ok = window.confirm('Are you sure you want to change product? You have not added the current selection.');
      if (!ok) return;
    }

    try { await onProductSelect(null, value); } catch {}
  }, [dabbaLock, dabbaProductId, selectedProduct, formik, onProductSelect]);

  const onPriceFocus = (e) => {
    if (isNameAdd) { firstDigitLockRef.current = null; return; }
    if (formik.values.name && formik.values.name.toLowerCase() === 'add') {
      firstDigitLockRef.current = null;
      return;
    }
    const val = String(e.target.value ?? '');
    if (!bowlPriceLock) {
      firstDigitLockRef.current = val.length > 0 ? val.charAt(0) : null;
    } else {
      try { firstDigitLockRef.current = String(val || '').charAt(0) || firstDigitLockRef.current; } catch {}
    }
  };

  const onPriceKeyDown = (e) => {
    const navKeys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End'];
    if (navKeys.includes(e.key)) return;

    if (bowlPriceLock) {
      const allowed = ['Backspace','Delete'];
      if (!/^\d$/.test(e.key) && !allowed.includes(e.key)) {
        e.preventDefault();
        return;
      }
    }

    if (isNameAdd) return;
    const isBackspace = e.key === 'Backspace';
    const isDelete = e.key === 'Delete';
    if (!isBackspace && !isDelete) return;
    const target=e.target; const start=target.selectionStart ?? 0; const end=target.selectionEnd ?? start;
    const deletingFirstChar = (isBackspace && start===1 && end===1) || (isDelete && start===0 && end===0) || (start===0 && end>0);
    if (deletingFirstChar) {
      if (bowlPriceLock) { e.preventDefault(); return; }
      e.preventDefault();
    }
  };

  const onPriceChange = (e) => {
    const rawInput = String(e.target.value || '');
    
    // Block restricted price ranges (200-209 and 301-309)
    if (isRestrictedPrice(rawInput)) {
      e.preventDefault && e.preventDefault();
      return;
    }
    
    if (!bowlPriceLock) {
      if (!isNameAdd) {
        if (!(formik.values.name && formik.values.name.toLowerCase() === 'add')) {
          const lock = firstDigitLockRef.current;
          if (lock && rawInput && String(rawInput).charAt(0) !== lock) { e.preventDefault && e.preventDefault(); return; }
        }
      }
      formik.setFieldValue('productPrice', rawInput);
      const numeric = Number(rawInput) || 0;
      formik.setFieldValue('totalPrice', Number((numeric * (Number(formik.values.quantity)||0)).toFixed(2)));
      return;
    }

    const digitsOnly = rawInput.replace(/\D/g, '');
    if (digitsOnly.length > 3) { e.preventDefault && e.preventDefault(); return; }
    
    // Block restricted price ranges for bowl price lock mode too
    if (isRestrictedPrice(digitsOnly)) {
      e.preventDefault && e.preventDefault();
      return;
    }
    
    const locked = String(firstDigitLockRef.current || '');
    if (locked && digitsOnly.length > 0 && String(digitsOnly).charAt(0) !== locked) { e.preventDefault && e.preventDefault(); return; }
    formik.setFieldValue('productPrice', digitsOnly);
    const numeric = Number(digitsOnly) || 0;
    formik.setFieldValue('totalPrice', Number((numeric * (Number(formik.values.quantity)||0)).toFixed(2)));
  };

  const onPriceBlur = () => {};
  const onPasteHandler = (e) => {
    try {
      const clip = (e.clipboardData || window.clipboardData).getData("text") || '';
      if (bowlPriceLock) {
        const digits = String(clip).replace(/\D/g,'');
        if (digits.length !== String(clip).length) { e.preventDefault(); return; }
        if (digits.length > 3) { e.preventDefault(); return; }
        const locked = String(firstDigitLockRef.current || '');
        if (locked && digits.length > 0 && String(digits).charAt(0) !== locked) { e.preventDefault(); return; }
      } else {
        if (!isNameAdd) {
          const lock = firstDigitLockRef.current;
          if (lock && clip && String(clip).charAt(0) !== lock) { e.preventDefault(); return; }
        }
      }
    } catch {}
  };

  const onQuantityChange = (e) => {
    const selectedIsBowl = Boolean(selectedProduct && ((selectedProduct.label || selectedProduct.value || '').toLowerCase().includes('bowl') || (rows && selectedProduct.productId && (rows[selectedProduct.productId]?.name || '').toLowerCase().includes('bowl'))));
    const isQuantityReadOnly = Boolean((isWeightReadOnly) || (selectedIsBowl && fetchedViaScale));
    if (isQuantityReadOnly) return;

    const raw = e.target.value;
    if (isWeightReadOnly) return;
    if (isWeighted) {
      const val = Number(raw) || 0;
      formik.setFieldValue('quantity', val);
      const price = Number(formik.values.productPrice) || 0;
      formik.setFieldValue('totalPrice', Number((price * val).toFixed(2)));
    } else {
      formik.setFieldValue('quantity', raw);
      const price = Number(formik.values.productPrice) || 0;
      const numericQty = Number(raw) || 0;
      formik.setFieldValue('totalPrice', Number((price * numericQty).toFixed(2)));
    }
  };

  const addProductHandler = useCallback(async () => {
    try {
      if (archivedOrderProps || archivedPdfUrl) {
        setArchivedOrderProps(null);
        setArchivedPdfUrl('');
      }

      lastAddSucceededRef.current = false;

      if (isWeighted) {
        const success = await weighingScaleHandler();
        if (!success) { alert("Failed to fetch weight. Product not added."); return; }
        await formik.submitForm();
      } else {
        await formik.submitForm();
      }

      await new Promise(r => setTimeout(r, 40));

      if (!lastAddSucceededRef.current) { alert("Add failed — product was not added. Please try again."); return; }
    } catch (err) {
      console.error('Add product handler failed', err);
      alert("Add failed due to an unexpected error. See console.");
    } finally {
      // after adding and resetting form, focus product price so user can quickly add next product
      try {
        setTimeout(() => {
          if (priceInputRef && priceInputRef.current && typeof priceInputRef.current.focus === 'function') {
            priceInputRef.current.focus();
            if (priceInputRef.current.select) priceInputRef.current.select();
          }
        }, 60);
      } catch {}
    }
  }, [weighingScaleHandler, formik, isWeighted, archivedOrderProps, archivedPdfUrl]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "=" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const valid = Boolean(
          formik.values.name &&
          (!isWeighted || (formik.values.productPrice && !isWeightedPriceInvalid))
        );
        if (valid) { e.preventDefault(); addProductHandler(); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [formik, isWeighted, isWeightedPriceInvalid, addProductHandler]);

  const fetchWeightLatestRef = useRef(weighingScaleHandler);
  useEffect(() => { fetchWeightLatestRef.current = weighingScaleHandler; });

  useEffect(() => {
    const onKeyDown = (e) => {
      const key=(e.key||'').toLowerCase(); const code=e.code||'';
      if (key==='/' || code==='Slash') { e.preventDefault(); try{ fetchWeightLatestRef.current && fetchWeightLatestRef.current(); } catch{} }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isEditableTarget = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    if (tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT') return true;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('[role="combobox"], .MuiInputBase-root')) return true;
    return false;
  };

  const selectAndMaybeAdd = useCallback(async (product) => {
    setSelectedQuick('dabba');
    setSelectedProduct(product);
    setInputValue(product?.label || product?.value || '');
    await attemptProductChange(product);

    try { if (product && product.productId) { setDabbaLock(true); setDabbaProductId(product.productId); } } catch {}

    try {
      const p = rows[product.productId];
      if (p && Number(p.pricePerKg) === 300) {
        // previously we set priceLock here; removed per request
      }
    } catch {}

    const { weight } = await dispatch(fetchWeightsAction());
    if (weight != null && Number(weight) > 0) {
      const name = rows[product.productId]?.name || product.value || '';
      if (archivedOrderProps || archivedPdfUrl) { setArchivedOrderProps(null); setArchivedPdfUrl(''); }
      formik.setFieldValue('id', product.productId);
      formik.setFieldValue('name', name);
      formik.setFieldValue('quantity', weight);
      setFetchedViaScale(true);
      const price = Number(formik.values.productPrice) || 0;
      formik.setFieldValue('totalPrice', Number((price * weight).toFixed(2)));
      setTimeout(() => formik.handleSubmit(), 100);
      clearQuickHighlight();
    } else {
      alert("Weight fetched is zero or invalid. Please ensure the scale is ready.");
      clearQuickHighlight();
    }
  }, [dispatch, formik, rows, attemptProductChange, archivedOrderProps, archivedPdfUrl]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== '1' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (isEditableTarget(t) || isEditableTarget(document.activeElement)) return;
      e.preventDefault();
      const product = productOptions.find(p => p.label.toLowerCase().includes('dabba'));
      if (product) { selectAndMaybeAdd(product); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [productOptions, selectAndMaybeAdd]);

  useEffect(() => { generatePdf(orderProps); }, [template, generatePdf, orderProps]);

  const removeItem = useCallback((index) => {
    if (window.confirm('Are you sure, you want to delete ?')) {
      setOrderProps((prev) => {
        const item = prev.orderItems[index]; if (!item) return prev;
        const subTotal = Number((prev.subTotal - (item?.totalPrice || 0)).toFixed(2));
        const tax = Number((subTotal * (prev.taxPercent / 100)).toFixed(2));
        const next = { ...prev, subTotal, tax, total: subTotal + tax, orderItems: prev.orderItems.filter((_, i) => i !== index) };
        try { generatePdf(next); } catch {}
        return next;
      });
    }
  }, [generatePdf]);

  // MAIN createOrder — offline-first (saves locally), with PDF + totals handling
  const createOrder = async () => {
    setSuppressAutoSuggest(true);
    try {
      setLastSubmitError(null);
      setLastSubmitResponse(null);

      if (!orderProps.orderItems || orderProps.orderItems.length === 0) {
        alert("Cannot create invoice: no items in the order.");
        setSuppressAutoSuggest(false);
        return;
      }

      // Validate items
      const invalids = [];
      orderProps.orderItems.forEach((it, idx) => {
        if (!it) invalids.push(`#${idx + 1}: empty item`);
        if (!it.productId) invalids.push(`#${idx + 1}: missing productId`);
        const q = Number(it.quantity);
        if (!Number.isFinite(q) || q <= 0) invalids.push(`#${idx + 1}: invalid quantity (${String(it.quantity)})`);
        const pp = Number(it.productPrice);
        if (!Number.isFinite(pp) || pp <= 0) invalids.push(`#${idx + 1}: invalid productPrice (${String(it.productPrice)})`);
      });
      if (invalids.length) {
        console.error("createOrder: invalid items", invalids);
        setLastSubmitError({ type: "validation", details: invalids });
        alert("Cannot create invoice — some items are invalid. See console or debug area for details.");
        setSuppressAutoSuggest(false);
        return;
      }

      // SANITIZE before save
      const sanitized = sanitizeOrderForServer(orderProps);

      // OFFLINE SAVE (localStorage)
      const savedOrder = saveOrderLocal(sanitized);

      // Save pending (backup)
      try { savePendingInvoice(savedOrder); } catch {}

      setLastSubmitResponse({
        stage: "offline_success",
        note: "Order saved locally (offline mode)",
        orderNumber: savedOrder.orderNumber,
        total: savedOrder.total,
        timestamp: new Date().toISOString(),
      });

      const newGT = addToTodayGrandTotal(savedOrder.total);
      setTodayGrandTotal(newGT);

      // Generate and archive PDF
      try { generatePdf(savedOrder); } catch {}
      setArchivedOrderProps(savedOrder);
      setArchivedPdfUrl(pdfUrl || "");
      setLastInvoiceTotal(savedOrder.total);

      // refresh history panel
      refreshHistory();

      alert(`✅ Order created successfully (Offline Mode)!\nOrder #: ${savedOrder.orderNumber}\nTotal: ₹${savedOrder.total}`);

      setOrderProps(initialOrderProps);
      formik.resetForm();
      setFetchedViaScale(false);
    } catch (err) {
      console.error("createOrder unexpected error:", err);
      setLastSubmitError({ type: "unexpected", message: String(err?.message || err), raw: err });
      alert("Something went wrong while creating the order. Check console / debug area.");
    } finally {
      setSuppressAutoSuggest(false);
    }
  };

  const hasUnsaved = Boolean(
    (orderProps?.orderItems?.length>0) || formik.values.name ||
    (formik.values.productPrice !== "" && formik.values.productPrice != null) ||
    Number(formik.values.quantity) > 0 || orderProps.customerName || orderProps.customerMobile || Number(orderProps.taxPercent) > 0
  );

  useEffect(() => {
    const handleBeforeUnload=(e)=>{ if(!hasUnsaved) return; e.preventDefault(); e.returnValue=''; return ''; };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsaved]);

  useEffect(() => {
    const onDocumentClick = (e) => {
      if (!hasUnsaved) return;
      const anchor = e.target?.closest && e.target.closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (anchor.hasAttribute('download') || href.startsWith('#')) return;
      const ok = window.confirm('You have unsaved changes. Leave this page?');
      if (!ok) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [hasUnsaved]);

  useEffect(() => {
    const onPopState = () => {
      if (!hasUnsaved) return;
      const ok = window.confirm('You have unsaved changes. Leave this page?');
      if (!ok) window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [hasUnsaved]);

  useEffect(() => {
    const H=window.history; const originalPush=H.pushState; const originalReplace=H.replaceState;
    function wrap(fn){ return function wrappedPushState(...args){ if(hasUnsaved){ const ok=window.confirm('You have unsaved changes. Leave this page?'); if(!ok) return; } return fn.apply(H,args); }; }
    H.pushState=wrap(originalPush); H.replaceState=wrap(originalReplace);
    return () => { H.pushState=originalPush; H.replaceState=originalReplace };
  }, [hasUnsaved]);

  useEffect(() => {
    const handlePrintHotkey = (e) => {
      const isPrint = (e.key==='p'||e.key==='P') && (e.ctrlKey||e.metaKey);
      if (isPrint) { e.preventDefault(); e.stopPropagation(); printPdf(); }
    };
    window.addEventListener('keydown', handlePrintHotkey, true);
    return () => window.removeEventListener('keydown', handlePrintHotkey, true);
  }, [printPdf]);

  useEffect(() => {
    const handleShiftD = (e) => {
      const key=(e.key||'').toLowerCase();
      if (key==='d' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        try { const len=(orderProps?.orderItems?.length)||0; if(len>0) removeItem(len-1); } catch {}
      }
    };
    window.addEventListener('keydown', handleShiftD);
    return () => window.removeEventListener('keydown', handleShiftD);
  }, [removeItem, orderProps?.orderItems?.length]);

  // Initialize today total and auto rollover at midnight
  useEffect(() => {
    setTodayGrandTotal(ensureTodayRecord());
    let timerId=null;
    const arm=()=>{ const delay=Math.max(1000, msToNextMidnight()); timerId=setTimeout(()=>{ const t=ensureTodayRecord(); setTodayGrandTotal(t); arm(); }, delay); };
    arm();
    return () => { if (timerId) clearTimeout(timerId); };
  }, []);

  // React to totals/invoice updates across tabs
  useEffect(() => {
    const onStorage=(e)=>{ 
      if(e.key===DAY_TOTAL_KEY) setTodayGrandTotal(ensureTodayRecord());
      if(e.key===INVOICES_KEY) refreshHistory();
    };
    const onInAppTotal=(e)=>{ const next=(e && e.detail!=null)?Number(e.detail):ensureTodayRecord(); setTodayGrandTotal(next); };
    const onInAppInvoices=()=>refreshHistory();
    const onInvoiceDeleted=(e)=>{ const d=e?.detail||{}; const today=getTodayStr();
      if(!d || (d.date && d.date!==today)) { setTodayGrandTotal(ensureTodayRecord()); return; }
      const next=subtractFromTodayGrandTotal(Number(d.total||0)); setTodayGrandTotal(next);
      refreshHistory();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('DAY_TOTAL_UPDATED', onInAppTotal);
    window.addEventListener('INVOICES_UPDATED', onInAppInvoices);
    window.addEventListener('INVOICE_DELETED', onInvoiceDeleted);
    refreshHistory(); // initial load
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('DAY_TOTAL_UPDATED', onInAppTotal);
      window.removeEventListener('INVOICES_UPDATED', onInAppInvoices);
      window.removeEventListener('INVOICE_DELETED', onInvoiceDeleted);
    };
  }, [refreshHistory]);

  useEffect(() => {
    const H=window.history; const originalPush=H.pushState; const originalReplace=H.replaceState;
    return () => { H.pushState=originalPush; H.replaceState=originalReplace };
  }, []);

  const visiblePdfUrl = archivedPdfUrl || pdfUrl;
  const visibleOrderDisplay = archivedOrderProps || orderProps;

  // Modal logic: open only if priceValue is in 300-399 and user hasn't suppressed modal
  const modalShouldBeOpen = priceValue >= 300 && priceValue <= 399 && Boolean(formik.values.name);
  const modalOpen = modalShouldBeOpen && !modalSuppress;

  // Reset suppression when price leaves range
  useEffect(() => {
    if (!(priceValue >= 300 && priceValue <= 399)) {
      setModalSuppress(false);
    }
  }, [priceValue]);

  // Ensure price input inside modal receives focus when modal opens (robust fallback if autoFocus doesn't mount fast enough)
  useEffect(() => {
    if (modalOpen) {
      try {
        setTimeout(() => {
          if (modalPriceRef && modalPriceRef.current && typeof modalPriceRef.current.focus === 'function') {
            modalPriceRef.current.focus();
            // also select existing text if present
            if (modalPriceRef.current.select) modalPriceRef.current.select();
          }
        }, 50);
      } catch {}
    }
  }, [modalOpen]);

  return (
    <>
      <Card><CardContent><CreateProduct /></CardContent></Card>

      <br />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <Box 
            component={"form"} 
            noValidate 
            autoComplete="off"
            sx={{
              backgroundColor: (priceValue >= 300 && priceValue <= 399) ? '#ffffff' : 'transparent',
              padding: (priceValue >= 300 && priceValue <= 399) ? 2 : 0,
              borderRadius: (priceValue >= 300 && priceValue <= 399) ? 1 : 0,
              transition: 'all 0.3s ease'
            }}
          >
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField size="small" id="customerName" name="customerName" label="Customer Name" value={orderProps.customerName} onChange={(e)=>{ const { id, value } = e.target; const obj = {}; if (id === 'taxPercent') { const taxPct = Number(value) || 0; obj['taxPercent'] = taxPct; const subTotal = orderProps.subTotal; obj['tax'] = Math.round(subTotal * (taxPct / 100)); obj['total'] = subTotal + obj['tax']; } setOrderProps((prevProps) => ({ ...prevProps, [id]: value, ...obj })); }} required fullWidth />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField size="small" id="customerMobile" name="customerMobile" label="Customer Mobile" value={orderProps.customerMobile} onChange={(e)=>{ const { id, value } = e.target; const obj = {}; if (id === 'taxPercent') { const taxPct = Number(value) || 0; obj['taxPercent'] = taxPct; const subTotal = orderProps.subTotal; obj['tax'] = Math.round(subTotal * (taxPct / 100)); obj['total'] = subTotal + obj['tax']; } setOrderProps((prevProps) => ({ ...prevProps, [id]: value, ...obj })); }} required fullWidth />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField size="small" type='number' id="taxPercent" name="taxPercent" label="Tax Percentage" value={orderProps.taxPercent} onChange={(e)=>{ const { id, value } = e.target; const obj = {}; if (id === 'taxPercent') { const taxPct = Number(value) || 0; obj['taxPercent'] = taxPct; const subTotal = orderProps.subTotal; obj['tax'] = Math.round(subTotal * (taxPct / 100)); obj['total'] = subTotal + obj['tax']; } setOrderProps((prevProps) => ({ ...prevProps, [id]: value, ...obj })); }} required fullWidth />
              </Grid>

              <Grid item xs={12} md={6} mt={2}>
                <Autocomplete
                  size="small"
                  options={customerOptions}
                  value={orderProps.customer}
                  onChange={(_, val) => setOrderProps(prev => ({...prev, customer: val}))}
                  renderInput={(params) => <TextField {...params} label="Select Customer" />}
                  getOptionLabel={(opt) => opt?.label || ''}
                  isOptionEqualToValue={(o, v) => (o?.id ?? o?._id ?? o?.label) === (v?.id ?? v?._id ?? v?.label)}
                />
              </Grid>

              <Grid item xs={12} md={6} mt={2}>
                <TextField
                  size="small"
                  id="notes"
                  name="notes"
                  label="Notes"
                  value={orderProps.notes}
                  onChange={(e)=>{ const { id, value } = e.target; setOrderProps((prevProps) => ({ ...prevProps, [id]: value })); }}
                  fullWidth
                  multiline
                  rows={1}
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Quick Select:</Typography>

                <Box sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap', py: 0.5 }}>
                  <Button
                    size="medium" variant={quickVariant('dabba')}
                    sx={{ mr: '320px', p: 1.5, ...(selectedQuick==='dabba' && HIGHLIGHT_SX) }}
                    color="success"
                    onClick={async () => {
                      const product = productOptions.find(p => p.label.toLowerCase().includes('dabba'));
                      if (product) {
                        setSelectedQuick('dabba');
                        setSelectedProduct(product);
                        setInputValue(product.label || product.value || '');
                        setHighlightedQuickProduct('dabba');
                        await attemptProductChange(product);
                        try { setDabbaLock(true); setDabbaProductId(product.productId); } catch {}
                        await onProductSelect(null, product);
                      } else { alert("Product '/dabba' not found"); }
                    }}
                  >{'1. /dabba'}</Button>

                  <Divider orientation="vertical" flexItem sx={{ mx: 2, borderColor: 'grey.600', borderWidth: 2, height: 44 }} />

                  <Button
                    size="medium" variant={quickVariant('thali delhi')}
                    sx={{ mr: 1, p: 1.5, ...(selectedQuick==='thali delhi' && HIGHLIGHT_SX) }}
                    color="error"
                    onClick={async () => {
                      const product = productOptions.find(p => p.label.toLowerCase().includes('thali delhi'));
                      if (product) {
                        setSelectedQuick('thali delhi');
                        setSelectedProduct(product);
                        setInputValue(product.label || product.value || '');
                        setHighlightedQuickProduct('thali delhi');
                        await attemptProductChange(product);
                        await onProductSelect(null, product);
                      } else { alert("Product '///thali delhi' not found"); }
                    }}
                  >{'2. ///thali delhi'}</Button>

                  <Button
                    size="medium" variant={quickVariant('kadi tiffin')}
                    sx={{ mr: 1, p: 1.5, ...(selectedQuick==='kadi tiffin' && HIGHLIGHT_SX) }}
                    onClick={async () => {
                      const product = productOptions.find(p => {
                        const lab = p.label.toLowerCase().replace(/[^a-z0-9]+/g,' ');
                        return lab.includes('kadi tiffin') || (/\bkdi\b/.test(lab) && /\btffn\b/.test(lab)) || /\bbt\s*tiffin\b/.test(lab);
                      });
                      if (product) {
                        setSelectedQuick('kadi tiffin');
                        setSelectedProduct(product);
                        setInputValue(product.label || product.value || '');
                        setHighlightedQuickProduct('kadi tiffin');
                        await attemptProductChange(product);
                        await onProductSelect(null, product);
                      } else { alert("Product 'kadi tiffin' not found"); }
                    }}
                  >{'3. kadi tiffin'}</Button>
                </Box>
              </Grid>

              <Grid item xs={12} md={6} mt={2}>
                <Select size="small" id="template" name="template" value={template} label="Select Template" onChange={(e) => setTemplate(e.target.value)} required fullWidth>
                  <MenuItem value={2}>PDF Template 2</MenuItem>
                  <MenuItem value={1}>PDF Template 1</MenuItem>
                </Select>
              </Grid>

              <Grid item xs={12} md={6} mt={2}>
                <Autocomplete
                  size="small"
                  id="name"
                  name="name"
                  options={productOptions}
                  value={selectedProduct}
                  inputValue={inputValue}
                  isOptionEqualToValue={(o, v) => o?.productId === v?.productId}
                  autoSelect={false}
                  selectOnFocus={false}
                  clearOnBlur
                  onChange={async (e, newValue) => {
                    setInputValue(newValue?.label ?? newValue?.value ?? '');
                    await attemptProductChange(newValue);
                  }}
                  onInputChange={(e, newInput, reason) => {
                    setInputValue(newInput ?? '');
                    if (reason === 'input' && selectedProduct) setSelectedProduct(null);
                  }}
                  renderInput={(params) => <TextField {...params} label="Select Product" />}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  type="number" size="small" id="productPrice" name="productPrice" 
                  label={isWeighted ? "Product Price (3-digit: 100-399)" : "Product Price"}
                  value={formik.values.productPrice} onChange={onPriceChange} onFocus={onPriceFocus} onBlur={onPriceBlur}
                  onPaste={onPasteHandler}
                  required fullWidth
                  error={Boolean(isWeightedPriceInvalid) && formik.values.productPrice !== ""}
                  helperText={
                    isWeighted && formik.values.productPrice !== "" 
                      ? (isWeightedPriceInvalid 
                          ? 'Must be 3 digits (100-399)' 
                          : priceRange 
                            ? `Range: ₹${priceRange}` 
                            : '')
                      : ''
                  }
                  inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', step: 1 }}
                  onKeyDown={onPriceKeyDown}
                  inputRef={priceInputRef}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField size="small" id="altName" name="altName" label="Alternate Name (optional)" placeholder="Print this name instead"
                  value={formik.values.altName} onChange={(e) => formik.setFieldValue('altName', e.target.value)} fullWidth />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField size="small" id="type" name="type" label="Product Type" value={formik.values.type} disabled required fullWidth
                  error={Boolean(formik.errors?.type)} helperText={formik.errors?.type} />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  size="small" type="number" id="quantity" name="quantity" label="Quantity (Kg)"
                  value={formik.values.quantity} onChange={onQuantityChange} required fullWidth
                  error={Boolean(formik.errors?.quantity)} helperText={formik.errors?.quantity}
                  InputProps={{
                    endAdornment: isWeighted ? (<Button onClick={weighingScaleHandler}><Sync /></Button>) : null,
                    readOnly: Boolean((isWeightReadOnly) || (selectedProduct && ((selectedProduct.label || selectedProduct.value || '').toLowerCase().includes('bowl') || (rows && selectedProduct.productId && (rows[selectedProduct.productId]?.name || '').toLowerCase().includes('bowl'))) && fetchedViaScale))
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField size="small" id="price" name="price" label="Total Price" value={formik.values.totalPrice} disabled required fullWidth
                  error={Boolean(formik.errors?.totalPrice)} helperText={formik.errors?.totalPrice} />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
                  Shortcuts: '/' for weight refresh, '=' to add product, Shift+D delete last item, Ctrl/Cmd+P print. Weighted: 3-digit prices only (100-399)
                </Typography>
                <Button variant="contained" onClick={createOrder} sx={{ float: "right", margin: "5px" }} disabled={orderProps.orderItems.length === 0}>Submit</Button>
                <Button variant="contained" onClick={addProductHandler} sx={{ float: "right", margin: "5px" }}
                  disabled={formik.values.name === "" || (isWeighted && (formik.values.productPrice === "" || isWeightedPriceInvalid))}
                >
                  Add Product
                </Button>

                {lastSubmitError && (
                  <Box sx={{ mt: 1, p: 1, border: '1px dashed red', backgroundColor: '#fff0f0' }}>
                    <Typography variant="caption" color="error">Last submit error:</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                      {lastSubmitError.message || JSON.stringify(lastSubmitError, null, 2)}
                    </Typography>
                  </Box>
                )}
                {lastSubmitResponse && (
                  <Box sx={{ mt: 1, p: 1, border: '1px dashed #888', backgroundColor: '#fafafa' }}>
                    <Typography variant="caption">Last server payload/response:</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                      {JSON.stringify(lastSubmitResponse, null, 2)}
                    </Typography>
                  </Box>
                )}

              </Grid>
            </Grid>
          </Box>
          <br />

          {orderProps.orderItems?.map((item, index) => (
            <Card key={index} sx={{ padding: '5px 15px ', margin: '5px 2px' }}>
              <Grid container>
                <Grid item xs={10}>
                  <Typography variant='body2'>
                    Name: {(item.altName && item.altName.trim())
                      ? `${item.altName.trim()} (Original: ${safeGetProductName(rows, item)})`
                      : safeGetProductName(rows, item)
                    } | Qty: {item.quantity} | Price: {item.totalPrice}
                  </Typography>
                </Grid>
                <Grid item xs={2} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => {
                    const currentItem = orderProps.orderItems[index]; if (!currentItem) return;
                    const currentNote = (currentItem.altName || "").trim();
                    const suggested = currentNote || safeGetProductName(rows, currentItem);
                    const newNote = window.prompt("Enter a note / alternate name for this product:", suggested);
                    if (newNote !== null) {
                      setOrderProps((prev) => {
                        const updated = [...prev.orderItems];
                        updated[index] = { ...updated[index], altName: String(newNote).trim() };
                        const nextProps = { ...prev, orderItems: updated };
                        try { generatePdf(nextProps); } catch {}
                        return nextProps;
                      });
                    }
                  }}>Edit Note</Button>
                  <Button size="small" onClick={() => removeItem(index)}><Delete /></Button>
                </Grid>
              </Grid>
            </Card>
          ))}
        </Grid>

        <Grid item xs={12} sm={6}>
          <Box sx={{ height: '90vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">Order #: {visibleOrderDisplay?.orderNumber}</Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography variant="subtitle2">Today's Total: ₹ {Number(todayGrandTotal).toLocaleString('en-IN')}</Typography>
                <Typography variant="subtitle2">Last Invoice: {lastInvoiceTotal != null ? `₹ ${Number(lastInvoiceTotal).toLocaleString('en-IN')}` : '—'}</Typography>
              </Box>
              <Button size="small" variant="outlined" onClick={printPdf}>Print PDF</Button>
            </Box>

            <Box sx={{ flexGrow: 1, '& iframe': { width: '100%', height: '100%', border: 'none' } }}>
              <iframe ref={pdfRef} src={visiblePdfUrl} title='Invoice' />
            </Box>

            {/* NEW: Past Totals Panel */}
            <Card sx={{ mt: 1 }}>
              <CardContent sx={{ py: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle2">Past totals (saved locally)</Typography>
                  <Button size="small" onClick={refreshHistory}>Refresh</Button>
                </Box>
                {dailyHistory.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No past invoices found.</Typography>
                ) : (
                  <Box sx={{ maxHeight: 220, overflowY: 'auto', pr: 1 }}>
                    {dailyHistory.map((row) => (
                      <Grid key={row.date} container sx={{ py: 0.5, borderBottom: '1px dashed #eee' }}>
                        <Grid item xs={5}><Typography variant="body2">{row.date}</Typography></Grid>
                        <Grid item xs={3}><Typography variant="body2">Bills: {row.count}</Typography></Grid>
                        <Grid item xs={4} sx={{ textAlign: 'right' }}>
                          <Typography variant="body2">₹ {Number(row.total).toLocaleString('en-IN')}</Typography>
                        </Grid>
                      </Grid>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>

      {/* Modal for distraction-free editing when price is 300-399 */}
      <Dialog
        open={Boolean(modalOpen)}
        onClose={() => setModalSuppress(true)}
        // make the dialog cover the whole viewport
        fullScreen
        // keep fullWidth for internal layout but maxWidth isn't needed when fullScreen
        PaperProps={{
          sx: {
            backgroundColor: '#ffffff',
            width: '100%',
            height: '100%',
            margin: 0,
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            // ensure content doesn't overflow awkwardly
            overflow: 'auto',
            p: 2
          }
        }}
        // ensure backdrop covers the window as usual
        BackdropProps={{ invisible: false }}
      >
        <DialogTitle>High-price editor (₹300–₹399)</DialogTitle>
        <DialogContent sx={{ flexGrow: 1 }}>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <TextField
              size="small"
              label="Product Name"
              value={formik.values.name}
              onChange={(e) => formik.setFieldValue('name', e.target.value)}
              fullWidth
            />
            <TextField
              // autofocus this field when the modal opens (and also provide ref fallback)
              autoFocus
              inputRef={modalPriceRef}
              size="small"
              label="Product Price"
              type="number"
              value={formik.values.productPrice}
              onChange={onPriceChange}
              onKeyDown={onPriceKeyDown}
              onPaste={onPasteHandler}
              helperText={isWeighted ? (isWeightedPriceInvalid ? 'Must be 3 digits (100-399)' : `Range: ₹${priceRange}`) : ''}
              fullWidth
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', step: 1 }}
            />
            <TextField
              size="small"
              label="Quantity"
              type="number"
              value={formik.values.quantity}
              onChange={onQuantityChange}
              InputProps={{
                endAdornment: isWeighted ? (<Button onClick={weighingScaleHandler}><Sync /></Button>) : null
              }}
              fullWidth
            />
            <TextField
              size="small"
              label="Alternate Name (optional)"
              value={formik.values.altName}
              onChange={(e) => formik.setFieldValue('altName', e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Total Price"
              value={formik.values.totalPrice}
              disabled
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalSuppress(true)}>Cancel</Button>
          <Button
            onClick={() => {
              // attempt add
              addProductHandler();
            }}
            variant="contained"
            disabled={formik.values.name === "" || (isWeighted && (formik.values.productPrice === "" || isWeightedPriceInvalid))}
          >
            Add Product
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
