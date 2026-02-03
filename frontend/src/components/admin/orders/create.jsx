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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
  Alert,
  Chip
} from '@mui/material';
import { CreateProduct } from '../products/create';
import pdfMake from 'pdfmake/build/pdfmake';
import { generatePdfDefinition, generatePdfDefinition2 } from './helper';
import { Delete, Sync, Info } from '@mui/icons-material';
import { fetchWeightsAction, createOrderAction } from '../../../store/orders';
import { ProductType } from '../../../enums/product';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../store/api'; // RTK Query API for cache invalidation
import axios from 'axios';

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
// eslint-disable-next-line no-unused-vars
const getTodayGrandTotal=()=>ensureTodayRecord();
// eslint-disable-next-line no-unused-vars
const addToTodayGrandTotal=(amt)=>{ const t=getTodayStr(); const d=getStoredDayTotal(); const base=(d&&d.date===t)?Number(d.total||0):0; const total=base+Number(amt||0); setStoredDayTotal({date:t,total}); try{window.dispatchEvent(new CustomEvent('DAY_TOTAL_UPDATED',{detail:total}))}catch{}; return total; };
// eslint-disable-next-line no-unused-vars
const subtractFromTodayGrandTotal=(amt)=>{ const t=getTodayStr(); const d=getStoredDayTotal(); const base=(d&&d.date===t)?Number(d.total||0):0; const total=Math.max(0,base-Number(amt||0)); setStoredDayTotal({date:t,total}); try{window.dispatchEvent(new CustomEvent('DAY_TOTAL_UPDATED',{detail:total}))}catch{}; return total; };
const msToNextMidnight=()=>{ const now=new Date(); const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,0); return next.getTime()-now.getTime(); };

const PENDING_INVOICES_KEY = 'pendingInvoices_v1';
// eslint-disable-next-line no-unused-vars
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

/**
 * IMPORTANT: Backend order validation is strict and only accepts:
 * orderDate, customerName, customerMobile, subTotal, tax, taxPercent, total, orderItems[]
 * So we must strip extra UI-only properties like `customer`, `notes`, `orderNumber`, etc.
 */
const sanitizeOrderForServer = (props = {}, isCreditSale = false) => {
  const { orderItems = [] } = props;

  const clean = orderItems.map((it) => {
    const cpy = { ...it } || {};
    cpy.productId = String(cpy.productId || cpy.id || '').trim();
    cpy.name = String(cpy.name || '').trim();
    cpy.altName = String(cpy.altName || '').trim();
    cpy.type = String(cpy.type || '').trim();
    cpy.quantity = toNum(cpy.quantity);
    cpy.productPrice = toNum(cpy.productPrice);
    cpy.totalPrice = toNum(cpy.totalPrice);
    return cpy;
  });

  const total = toNum(props.total);
  
  return {
    orderDate: props.orderDate || getTodayStr(),
    customerName: props.customerName || '',
    customerMobile: props.customerMobile || '',
    subTotal: toNum(props.subTotal),
    tax: toNum(props.tax),
    taxPercent: toNum(props.taxPercent),
    total: total,
    // Credit sale: paidAmount = 0, otherwise fully paid
    paidAmount: isCreditSale ? 0 : total,
    orderItems: clean,
  };
};

/* Helper: detect name "add" (case-insensitive) */
const isAddName = (name) =>
  String(name || '').trim().toLowerCase() === 'add';

/* Helper: detect products that should NOT use original price (Y, PRODUCT X) */
const isNoPriceProduct = (name) => {
  const n = String(name || '').trim().toLowerCase();
  return n === 'y' || n === 'product x';
};

/* Helper: check if price is in restricted ranges (200-209 or 301-309) for weighted products */
const isRestrictedPrice = (price) => {
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice)) return false;
  return (numPrice >= 200 && numPrice <= 209) || (numPrice >= 301 && numPrice <= 309);
};

/* -------------------------
  Minimal offline DB (self-contained)
------------------------- */
function toNumber(n){ const x = Number(n); return Number.isFinite(x) ? x : 0; }
// eslint-disable-next-line no-unused-vars
function recomputeTotals(order) {
  const sub = (order.orderItems || []).reduce((s, it) => s + toNumber(it.totalPrice), 0);
  const tax = Math.round(sub * (toNumber(order.taxPercent) / 100));
  const total = sub + tax;
  return { subTotal: sub, tax, total };
}
// eslint-disable-next-line no-unused-vars
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

  // Note: Invoices are now stored server-side only
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
  const { isAdmin, isBillingStaff } = useAuth();

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
  
  // Local state for customers fetched from API
  const [customers, setCustomers] = useState([]);
  
  // Fetch customers from database on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = localStorage.getItem('token');
        const { data } = await axios.get('/api/customers/with-balance', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCustomers(data.data?.rows || []);
      } catch (error) {
        console.error('Error fetching customers:', error);
        // Fallback to basic customers endpoint
        try {
          const token = localStorage.getItem('token');
          const { data } = await axios.get('/api/customers', {
            headers: { Authorization: `Bearer ${token}` }
          });
          setCustomers(data.data?.rows || data.rows || []);
        } catch (e) {
          console.error('Fallback error:', e);
        }
      }
    };
    fetchCustomers();
  }, []);

  const customerOptions = useMemo(() => customers.map((c) => ({
    ...c,
    label: `${c?.name || 'Customer'}${c?.mobile ? ` (${c.mobile})` : ''}`,
    name: c?.name || '',
    mobile: c?.mobile || '',
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

  // Local state for price input - prevents race condition when typing quickly
  const [localPriceValue, setLocalPriceValue] = useState('');
  const priceUpdateTimeoutRef = useRef(null);

  // ref for modal price input to ensure focus works reliably
  const modalPriceRef = useRef(null);
  // ref for main productPrice input to focus after adding / selecting product
  const priceInputRef = useRef(null);

  const [selectedQuick, setSelectedQuick] = useState('');
  const clearQuickHighlight = () => setSelectedQuick('');
  const [highlightedQuickProduct, setHighlightedQuickProduct] = useState(null);
  const quickVariant = (tag) => (selectedQuick === tag || highlightedQuickProduct === tag ? 'contained' : 'outlined');

  const [template, setTemplate] = useState(1);
  const TEMPLATE_MAP = useMemo(() => ({ 1: 2, 2: 1 }), []);

  const [archivedOrderProps, setArchivedOrderProps] = useState(null);
  const [archivedPdfUrl, setArchivedPdfUrl] = useState('');

  // Track recently submitted invoice items - shown until new item is added
  const [recentlySubmittedOrder, setRecentlySubmittedOrder] = useState(null);

  const [lastSubmitError, setLastSubmitError] = useState(null);
  const [lastSubmitResponse, setLastSubmitResponse] = useState(null);
  const [lastInvoiceTotal, setLastInvoiceTotal] = useState(null);

  const [suppressAutoSuggest, setSuppressAutoSuggest] = useState(false);

  // NEW: switch to control whether product named "add" is allowed
  const [allowAddProductName, setAllowAddProductName] = useState(false);

  // Credit Sale toggle - when ON, customer name is mandatory and order is marked unpaid
  const [isCreditSale, setIsCreditSale] = useState(false);

  // Admin guide visibility - hidden by default
  const [showAdminGuide, setShowAdminGuide] = useState(false);

  // use suppressAutoSuggest in a small effect so eslint doesn't flag it as assigned but unused
  useEffect(() => {
    if (suppressAutoSuggest) {
      // reserved for future behavior
    }
  }, [suppressAutoSuggest]);

  // bowl lock only
  const [bowlPriceLock, setBowlPriceLock] = useState(false);
  const [bowlProductIdLocked, setBowlProductIdLocked] = useState(null);

  const [fetchedViaScale, setFetchedViaScale] = useState(false);

  // Modal suppression state (if user explicitly closes modal for current price range)
  const [modalSuppress, setModalSuppress] = useState(false);
  // Explicit open state so modal doesn't close while typing
  const [modalOpen, setModalOpen] = useState(false);

  // For "Y" and "PRODUCT X": track original price and toggle to allow/block using it
  const [originalPriceForSpecial, setOriginalPriceForSpecial] = useState(null);
  const [allowOriginalPrice, setAllowOriginalPrice] = useState(false);

  // NEW: Past totals (history)
  const [dailyHistory, setDailyHistory] = useState([]);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');
  const refreshHistory = useCallback(() => {
    const inv = loadAllInvoices();
    setDailyHistory(computeDailyTotalsFromInvoices(inv));
  }, []);

  // Tens digit protection - blocks 1,2,3,4 in tens place unless Caps Lock is ON
  // Only enabled for admin users, billing staff can type freely
  const [tensDigitProtection, setTensDigitProtection] = useState(true); // Default ON for admin

  const printPdf = useCallback(() => {
    try {
      // Only allow printing if an order has been submitted (archivedOrderProps exists)
      if (!archivedOrderProps) {
        alert('Please create (submit) an order first before printing.');
        return;
      }
      if (!pdfUrl && !archivedPdfUrl) return;
      const frame = pdfRef.current;
      if (frame && frame.contentWindow) { frame.contentWindow.focus(); frame.contentWindow.print(); return; }
      const w = window.open(archivedPdfUrl || pdfUrl);
      if (w) { const onLoad = () => { try { w.print(); } catch {} }; w.addEventListener('load', onLoad, { once: true }); }
    } catch {}
  }, [pdfUrl, archivedPdfUrl, archivedOrderProps]);

  const generatePdf = useCallback((pdfProps) => {
    return new Promise((resolve) => {
      const updatedProps = JSON.parse(JSON.stringify(pdfProps));
      updatedProps.orderItems = updatedProps.orderItems?.map(item => ({
        name: (item.altName && item.altName.trim()) ? item.altName.trim() : safeGetProductName(rows, item),
        productPrice: item.productPrice,
        quantity: item.quantity,
        totalPrice: item.totalPrice
      })) ?? [];
      const chosen = TEMPLATE_MAP[template] ?? template;
      const pdfObject = chosen === 1 ? generatePdfDefinition(updatedProps) : generatePdfDefinition2(updatedProps);
      pdfMake.createPdf(pdfObject).getBlob((blob) => { 
        const url = URL.createObjectURL(blob); 
        setPdfUrl(url);
        resolve(url);
      });
    });
  }, [rows, template, TEMPLATE_MAP]);

  const initialOrderProps = useMemo(() => ({
    customerName: "", 
    customerMobile: "",
    customer: null,
    notes: "",
    orderNumber: "(Will be generated on save)",
    orderDate: moment().format("DD-MM-YYYY"), // This is set once on mount
    orderItems: [], 
    subTotal: 0, 
    tax: 0, 
    taxPercent: 0, 
    total: 0
  }), []);
  
  const [orderProps, setOrderProps] = useState(initialOrderProps);
  
  // Update orderDate to today whenever the component becomes visible/focused
  useEffect(() => {
    const updateDateIfNeeded = () => {
      const today = moment().format("DD-MM-YYYY");
      setOrderProps(prev => {
        if (prev.orderDate !== today) {
          return { ...prev, orderDate: today };
        }
        return prev;
      });
    };
    
    // Update on mount
    updateDateIfNeeded();
    
    // Update when window gains focus (user comes back to tab)
    window.addEventListener('focus', updateDateIfNeeded);
    
    // Update at midnight
    const msToMidnight = msToNextMidnight();
    const midnightTimer = setTimeout(updateDateIfNeeded, msToMidnight + 1000);
    
    return () => {
      window.removeEventListener('focus', updateDateIfNeeded);
      clearTimeout(midnightTimer);
    };
  }, []);
  
  const orderItemsRef = useRef(orderProps.orderItems || []);
  useEffect(() => { orderItemsRef.current = orderProps.orderItems || []; }, [orderProps.orderItems]);

  // eslint-disable-next-line no-unused-vars
  const [todayGrandTotal, setTodayGrandTotal] = useState(getTodayGrandTotal());
  const [isSubmitting, setIsSubmitting] = useState(false); // Prevent double submission

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [recentlyDeleted, setRecentlyDeleted] = useState([]);

  function formikSafeGet(field) {
    try { return (formik && formik.values && formik.values[field]) || ""; } catch { return ""; }
  }

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: { id:"", type:"", name:"", altName:"", template:1, productPrice:"", quantity:0, totalPrice:0 },
    onSubmit: async (values) => {
      lastAddSucceededRef.current = false;

      // HARD BLOCK: do not allow product "add" if switch is OFF
      if (!allowAddProductName && isAddName(values?.name)) {
        alert("Product 'add' is disabled. Turn ON the switch to use it.");
        return;
      }

      // BLOCK: For "Y" and "PRODUCT X", if toggle is OFF, cannot use original price
      if (isNoPriceProduct(values?.name) && originalPriceForSpecial !== null && !allowOriginalPrice) {
        const currentPrice = Number(values?.productPrice) || 0;
        if (currentPrice === originalPriceForSpecial) {
          alert(`Cannot use original price (${originalPriceForSpecial}) for this product. Please edit the price or turn ON "Allow Original Price".`);
          return;
        }
      }

      try {
        const currentIsBowl = Boolean(values && (String(values.name || '').toLowerCase().includes('bowl') || (bowlProductIdLocked && String(values.id) === String(bowlProductIdLocked))));
        if (currentIsBowl || bowlPriceLock) {
          const valStr = String(values.productPrice || '').replace(/\D/g,'');
          if (valStr.length !== 3) { alert('Bowl price must be exactly 3 digits (100–399).'); return; }
          const numeric = Number(valStr);
          if (numeric < 100 || numeric > 399) { alert('Bowl price must be between 100 and 399.'); return; }
          // Block restricted ranges (200-209, 301-309) for weighted/bowl
          if (isRestrictedPrice(numeric)) { alert('Price cannot be in ranges 200-209 or 301-309 for weighted products.'); return; }
          values.productPrice = valStr;
        }
      } catch {}

      if (Number(values.quantity) <= 0) { alert("Cannot add product with zero quantity. Please fetch a valid weight."); return; }

      const priceNumLocal = Number(values?.productPrice) || 0;
      
      // For weighted products: enforce 3-digit price (100-399) and forbid restricted ranges
      // IMPORTANT: 'add' must be treated as NON-weighted and bypass these restrictions
      const isWeightedProduct =
        !isAddName(values?.name) &&
        (values?.type === ProductType.WEIGHTED || String(values?.type||'').toLowerCase()==='weighted');
      if (isWeightedProduct) {
        const priceStr = String(priceNumLocal);
        // Block restricted ranges (200-209, 301-309)
        if (isRestrictedPrice(priceNumLocal)) {
          alert('Price cannot be in ranges 200-209 or 301-309 for weighted products.');
          return;
        }
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
      setLocalPriceValue('');
      setSelectedProduct(null);
      setInputValue('');
      try { setFetchedViaScale(false); } catch {}
      clearQuickHighlight();
    }
  });

  // Track when product selection changes to trigger price sync
  const lastProductIdRef = useRef(null);

  // Sync local price state with formik ONLY when product changes (not during typing)
  useEffect(() => {
    const currentProductId = formik.values.id;
    // Sync whenever product changes OR price changes from product selection
    if (currentProductId !== lastProductIdRef.current) {
      lastProductIdRef.current = currentProductId;
      const formikPrice = formik.values.productPrice;
      setLocalPriceValue(formikPrice ? String(formikPrice) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formik.values.id, formik.values.productPrice]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (priceUpdateTimeoutRef.current) {
        clearTimeout(priceUpdateTimeoutRef.current);
      }
    };
  }, []);

  // SPECIAL: correctly detect name "add" instead of using "!id"
  const isNameAdd = isAddName(formik.values.name);

  const isWeighted = !isNameAdd && (
    formik.values.type === ProductType.WEIGHTED ||
    String(formik.values.type||'').toLowerCase()==='weighted'
  );
  
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
  
  const computedPriceRange = getPriceRange(priceValue);
  
  const isWeightReadOnly = Boolean((isWeighted && fetchedViaScale));

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

  // Helper: focus main price input, with 2xx last-two-digit selection
  const focusMainPriceInput = useCallback(() => {
    try {
      setTimeout(() => {
        const el = priceInputRef && priceInputRef.current;
        if (!el || typeof el.focus !== 'function') return;
        el.focus();
        const val = String(el.value || '');
               const len = val.length;
        if (typeof el.setSelectionRange === 'function') {
          const num = Number(val);
          if (Number.isFinite(num) && num >= 200 && num <= 299 && len >= 3) {
            el.setSelectionRange(len - 2, len);
          } else {
            el.setSelectionRange(0, len);
          }
        } else if (typeof el.select === 'function') {
          el.select();
        }
      }, 80);
    } catch {}
  }, []);

  // Helper: virtual keypad digit writer (main + modal)
  const applyDigitToPrice = (digit, targetRefOverride = null) => {
    const targetRef = targetRefOverride || (modalOpen ? modalPriceRef : priceInputRef);
    const el = targetRef && targetRef.current;
    const dStr = String(digit);

    if (el) {
      const val = String(el.value || '');
      const start = el.selectionStart != null ? el.selectionStart : val.length;
      const end = el.selectionEnd != null ? el.selectionEnd : val.length;
      const newVal = val.slice(0, start) + dStr + val.slice(end);

      onPriceChange({ target: { value: newVal }, preventDefault: () => {} });

      setTimeout(() => {
        try {
          el.focus();
          const pos = start + dStr.length;
          if (el.setSelectionRange) el.setSelectionRange(pos, pos);
        } catch {}
      }, 0);
    } else {
      const cur = String(formik.values.productPrice || '');
      const newVal = cur + dStr;
      onPriceChange({ target: { value: newVal }, preventDefault: () => {} });
    }
  };

  // Helper: up/down counter for price (used by buttons + ArrowUp/ArrowDown)
  const adjustPriceByStep = (delta, targetRefOverride = null) => {
    const current = Number(formik.values.productPrice || 0) || 0;
    let next = current + delta;
    if (next < 0) next = 0;
    const newVal = String(next);

    onPriceChange({ target: { value: newVal }, preventDefault: () => {} });

    const targetRef = targetRefOverride || (modalOpen ? modalPriceRef : priceInputRef);
    const el = targetRef && targetRef.current;
    if (el) {
      setTimeout(() => {
        try {
          const len = (el.value || '').length;
          el.focus();
          if (el.setSelectionRange) el.setSelectionRange(len, len);
        } catch {}
      }, 0);
    }
  };

  // use stable classifyQuickTag from outer scope
  const onProductSelect = useCallback(async (e, value) => {
    if (
      selectedProduct &&
      value?.productId !== selectedProduct?.productId &&
      formik.values.name &&
      !orderItemsRef.current.some(item => item.productId === formik.values.id)
    ) {
      const ok = window.confirm('Are you sure you want to change product? You have not added the current selection.');
      if (!ok) return;
    }

    const rawName = (rows && value && value.productId && rows[value.productId]?.name)
      ? rows[value.productId].name
      : (value?.label || value?.value || '');
    setSelectedQuick(classifyQuickTag(rawName));
    setSelectedProduct(value);

    if (value) {
      const { productId } = value;
      const resolvedName = (rows && productId && rows[productId]?.name)
        ? rows[productId].name
        : (value?.value || value?.label || '');

      const isAddSpecial = isAddName(resolvedName);

      // HARD BLOCK at selection level as well
      if (!allowAddProductName && isAddSpecial) {
        alert("Product 'add' is disabled. Turn ON the switch to use it.");
        formik.resetForm();
        setLocalPriceValue('');
        setSelectedProduct(null);
        setInputValue('');
        clearQuickHighlight();
        return;
      }

      if (!rows || !productId || !rows[productId]) {
        formik.setFieldValue('id', productId ?? "");
        formik.setFieldValue('name', value?.value || "");
        formik.setFieldValue('type', "");
        formik.setFieldValue('productPrice', "");
        setLocalPriceValue("");
        formik.setFieldValue('totalPrice', 0);
        setBowlPriceLock(false);
        setBowlProductIdLocked(null);

        // focus price even for custom products (with 2xx selection logic)
        focusMainPriceInput();
        setTimeout(() => clearQuickHighlight(), 100);
        return;
      }
      formik.setFieldValue('id', productId ?? "");
      formik.setFieldValue('name', rows[productId]?.name || "");
      formik.setFieldValue('type', rows[productId]?.type || "");
      const price = rows[productId]?.pricePerKg || 0;
      const productName = rows[productId]?.name || "";
      
      // For products "Y" and "PRODUCT X", track original price for validation
      if (isNoPriceProduct(productName)) {
        setOriginalPriceForSpecial(price);
        setAllowOriginalPrice(false); // Default: must change price
        firstDigitLockRef.current = null; // No first-digit lock for these products
      } else {
        setOriginalPriceForSpecial(null);
        try { firstDigitLockRef.current = (String(price || '') || '').charAt(0) || null; } catch {}
      }
      
      // Set both formik and local state for price display
      const priceStr = price ? String(price) : "";
      formik.setFieldValue('productPrice', priceStr);
      setLocalPriceValue(priceStr);
      formik.setFieldValue('totalPrice', Number((((price||0) * (Number(formik.values.quantity)||0))).toFixed(2)));

      const selectedType = rows[productId]?.type;

      // 'add' must NOT behave as weighted, even if DB type says weighted
      const looksWeighted = !isAddSpecial && (
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
      // NOTE: Do NOT auto-fetch weight on product selection
      // User should select product, set price, then press '=' to fetch weight and add
      // This allows the product to remain selected even without a connected scale

      // After product selection, focus the productPrice input with 2xx logic
      if (!modalOpen) {
        focusMainPriceInput();
      }

      setTimeout(() => clearQuickHighlight(), 100);
    } else {
      formik.resetForm();
      setLocalPriceValue('');
      setSelectedProduct(null);
      setInputValue('');
      try { setFetchedViaScale(false); } catch {}
      setBowlPriceLock(false);
      setBowlProductIdLocked(null);
      setOriginalPriceForSpecial(null);
      setAllowOriginalPrice(false);
      clearQuickHighlight();
    }
  }, [selectedProduct, formik, rows, weighingScaleHandler, allowAddProductName, modalOpen, focusMainPriceInput]);

  const attemptProductChange = useCallback(async (value) => {
    // Whenever user tries to change product, allow modal to show again for the new selection
    setModalSuppress(false);

    const currentlySelected = selectedProduct;
    const currentNameFilled = !!(formik.values.name);
    const currentNotAdded = !orderItemsRef.current.some(item => item.productId === formik.values.id);

    if (currentlySelected && value && value.productId !== currentlySelected.productId && currentNameFilled && currentNotAdded) {
      const ok = window.confirm('Are you sure you want to change product? You have not added the current selection.');
      if (!ok) return;
    }

    try { await onProductSelect(null, value); } catch {}
  }, [selectedProduct, formik, onProductSelect]);

  const onPriceFocus = (e) => {
    // For 'add', remove first-digit lock entirely so it's totally free
    if (isNameAdd) { firstDigitLockRef.current = null; return; }
    const val = String(e.target.value ?? '');
    if (!bowlPriceLock) {
      firstDigitLockRef.current = val.length > 0 ? val.charAt(0) : null;
    } else {
      try { firstDigitLockRef.current = String(val || '').charAt(0) || firstDigitLockRef.current; } catch {}
    }
  };

  const onPriceKeyDown = (e) => {
    const isUp = e.key === 'ArrowUp';
    const isDown = e.key === 'ArrowDown';

    // Physical keyboard counter support
    if (isUp || isDown) {
      e.preventDefault();
      adjustPriceByStep(isUp ? 1 : -1, modalOpen ? modalPriceRef : priceInputRef);
      return;
    }

    const navKeys = ['ArrowLeft','ArrowRight','Tab','Home','End'];
    if (navKeys.includes(e.key)) return;

    // Tens digit protection: block 1,2,3,4,5 in tens place unless Caps Lock is ON
    // Disabled for billing staff - they can type freely
    const protectionEnabled = tensDigitProtection && isAdmin && !isBillingStaff;
    if (protectionEnabled && /^[12345]$/.test(e.key) && !e.getModifierState('CapsLock')) {
      const target = e.target;
      const currentValue = String(target.value || '');
      const selStart = target.selectionStart ?? currentValue.length;
      const selEnd = target.selectionEnd ?? selStart;
      
      // Check if typing in tens place (position 1, i.e., second character)
      // This happens when: cursor is at position 1, or selecting from position 1
      // OR when current value has 1 digit and we're adding the second
      const wouldBeInTensPlace = (currentValue.length === 1 && selStart === 1 && selEnd === 1) ||
                                  (selStart === 1 && selEnd === 1);
      
      if (wouldBeInTensPlace) {
        e.preventDefault();
        return;
      }
    }

    if (bowlPriceLock) {
      const allowed = ['Backspace','Delete'];
      if (!/^\d$/.test(e.key) && !allowed.includes(e.key)) {
        e.preventDefault();
        return;
      }
    }

    // For 'add', no extra blocking here
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
    // Get the input element directly from the event
    const inputElement = e.target;
    const rawInput = String(inputElement.value || '');
    
    // DO NOT update local state during typing - let the DOM handle it
    // Only update formik with debounce for data consistency

    // Clear any pending debounced update
    if (priceUpdateTimeoutRef.current) {
      clearTimeout(priceUpdateTimeoutRef.current);
    }

    if (!bowlPriceLock) {
      // For 'add' products, do not enforce first-digit lock
      if (!isNameAdd) {
        const lock = firstDigitLockRef.current;
        if (lock && rawInput && String(rawInput).charAt(0) !== lock) {
          e.preventDefault && e.preventDefault();
          // Don't update localPriceValue - keeps showing old value
          return;
        }
      }
      
      const numeric = Number(rawInput) || 0;
      
      // Block restricted ranges (200-209, 301-309) only for weighted products
      if (isWeighted && String(rawInput).length >= 3 && isRestrictedPrice(numeric)) {
        e.preventDefault && e.preventDefault();
        // Don't update localPriceValue - keeps showing old value
        return;
      }
      
      // Update local state for display purposes (non-critical sync)
      setLocalPriceValue(rawInput);
      
      // Capture current quantity for the debounced callback
      const currentQuantity = Number(formik.values.quantity) || 0;
      
      // Debounce formik update
      priceUpdateTimeoutRef.current = setTimeout(() => {
        formik.setFieldValue('productPrice', rawInput);
        formik.setFieldValue('totalPrice', Number((numeric * currentQuantity).toFixed(2)));
      }, 150); // 150ms debounce
      return;
    }

    // Bowl path - get input element reference (already have inputElement from above)
    const digitsOnly = rawInput.replace(/\D/g, '');
    if (digitsOnly.length > 3) { 
      e.preventDefault && e.preventDefault(); 
      // Don't update localPriceValue - keeps showing old value
      return; 
    }
    const locked = String(firstDigitLockRef.current || '');
    if (!isNameAdd && locked && digitsOnly.length > 0 && String(digitsOnly).charAt(0) !== locked) { 
      e.preventDefault && e.preventDefault(); 
      // Don't update localPriceValue - keeps showing old value
      return; 
    }
    
    const numericBowl = Number(digitsOnly) || 0;
    
    // Block restricted ranges (200-209, 301-309) for weighted products
    if (isWeighted && digitsOnly.length >= 3 && isRestrictedPrice(numericBowl)) {
      e.preventDefault && e.preventDefault();
      // Don't update localPriceValue - keeps showing old value
      return;
    }
    
    // Update local state (controlled component)
    setLocalPriceValue(digitsOnly);
    
    // Capture current quantity for the debounced callback
    const currentQuantityBowl = Number(formik.values.quantity) || 0;
    
    // Debounce formik update
    priceUpdateTimeoutRef.current = setTimeout(() => {
      formik.setFieldValue('productPrice', digitsOnly);
      formik.setFieldValue('totalPrice', Number((numericBowl * currentQuantityBowl).toFixed(2)));
    }, 150); // 150ms debounce
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
        if (!isNameAdd && locked && digits.length > 0 && String(digits).charAt(0) !== locked) { e.preventDefault(); return; }
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

      // Extra guard for 'add' on manual Add button too
      if (!allowAddProductName && isAddName(formik.values.name)) {
        alert("Product 'add' is disabled. Turn ON the switch to use it.");
        return;
      }

      if (isWeighted) {
        // Check if weight was already fetched (via '=' key, '/' key, or Sync button)
        const currentQuantity = Number(formik.values.quantity) || 0;
        if (fetchedViaScale && currentQuantity > 0) {
          // Weight already fetched, just submit
          await formik.submitForm();
        } else {
          // Need to fetch weight first
          const success = await weighingScaleHandler();
          if (!success) { alert("Failed to fetch weight. Product not added."); return; }
          await formik.submitForm();
        }
      } else {
        await formik.submitForm();
      }

      await new Promise(r => setTimeout(r, 40));

      if (!lastAddSucceededRef.current) { alert("Add failed — product was not added. Please try again."); return; }

      // whenever a product is successfully added, auto-close the high-price modal
      // and reset suppression so it can open again for the next high-price item.
      setModalOpen(false);
      setModalSuppress(false);
    } catch (err) {
      console.error('Add product handler failed', err);
      alert("Add failed due to an unexpected error. See console.");
    } finally {
      // after adding and resetting form, focus product price so user can quickly add next product
      if (!modalOpen) {
        focusMainPriceInput();
      }
    }
  }, [weighingScaleHandler, formik, isWeighted, archivedOrderProps, archivedPdfUrl, allowAddProductName, modalOpen, focusMainPriceInput, fetchedViaScale]);

  // Use ref to always have access to latest formik values in keydown handler
  const formikRef = useRef(formik);
  useEffect(() => { formikRef.current = formik; }, [formik]);

  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.key === "=" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const currentFormik = formikRef.current;
        
        // Check if product is selected
        if (!currentFormik.values.name) return;
        
        // Check if 'add' product is allowed
        if (!allowAddProductName && isAddName(currentFormik.values.name)) return;
        
        e.preventDefault();
        
        // Get quantity from DOM input directly (more reliable than formik state)
        const qtyInput = document.getElementById('quantity');
        const qtyFromDOM = qtyInput ? Number(qtyInput.value) || 0 : 0;
        
        const productIsWeighted = currentFormik.values.type === 'weighted' || 
          String(currentFormik.values.type || '').toLowerCase() === 'weighted';
        
        if (productIsWeighted) {
          // For weighted products: fetch weight from scale
          // Validate price (3-digit, not in restricted ranges, etc.)
          const priceVal = Number(currentFormik.values.productPrice) || 0;
          const priceString = String(priceVal);
          const isPriceInvalid = priceString.length !== 3 || priceVal < 100 || priceVal > 399;
          
          if (!currentFormik.values.productPrice || isPriceInvalid) return;
          
          // Fetch weight
          const result = await dispatch(fetchWeightsAction());
          
          // Check if we got a result with weight
          const weight = result?.weight;
          if (weight == null || Number(weight) <= 0) {
            alert("Weight fetched is zero or invalid. Please ensure the scale is ready.");
            return;
          }
          
          // Set the weight and calculate total
          currentFormik.setFieldValue('quantity', weight);
          setFetchedViaScale(true);
          const price = Number(currentFormik.values.productPrice) || 0;
          currentFormik.setFieldValue('totalPrice', Number((price * weight).toFixed(2)));
          
          // Small delay to ensure state is updated, then submit
          setTimeout(async () => {
            await currentFormik.submitForm();
            setModalOpen(false);
            setModalSuppress(false);
          }, 100);
        } else {
          // For non-weighted products: validate quantity and add directly
          // Use DOM value as it's more up-to-date than formik state
          const currentQty = qtyFromDOM > 0 ? qtyFromDOM : (Number(currentFormik.values.quantity) || 0);
          
          if (currentQty <= 0) {
            alert("Please enter a valid quantity before adding.");
            return;
          }
          
          // Ensure formik has the correct quantity value from DOM
          const price = Number(currentFormik.values.productPrice) || 0;
          if (qtyFromDOM > 0) {
            await currentFormik.setFieldValue('quantity', qtyFromDOM);
            await currentFormik.setFieldValue('totalPrice', Number((price * qtyFromDOM).toFixed(2)));
          }
          
          // Longer delay to ensure state is fully updated, then submit
          setTimeout(async () => {
            await currentFormik.submitForm();
            setModalOpen(false);
            setModalSuppress(false);
          }, 150);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWeightedPriceInvalid, allowAddProductName, dispatch]);

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

    try {
      const p = rows[product.productId];
      if (p && Number(p.pricePerKg) === 300) {
        // previously we set priceLock here; removed
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

  const restoreDeletedItem = useCallback((idx) => {
    setRecentlyDeleted(prev => {
      const item = prev[idx];
      if (!item) return prev;
      setOrderProps(prevOrder => {
        const subTotal = Number((prevOrder.subTotal + (item.totalPrice || 0)).toFixed(2));
        const tax = Number((subTotal * (prevOrder.taxPercent / 100)).toFixed(2));
        const next = {
          ...prevOrder,
          subTotal,
          tax,
          total: subTotal + tax,
          orderItems: [...prevOrder.orderItems, item]
        };
        try { generatePdf(next); } catch {}
        return next;
      });
      return prev.filter((_, i) => i !== idx);
    });
  }, [generatePdf]);

  const removeItem = useCallback((index) => {
    if (window.confirm('Are you sure, you want to delete ?')) {
      setOrderProps((prev) => {
        const item = prev.orderItems[index]; 
        if (!item) return prev;

        // Track recently deleted items (keep latest 5)
        setRecentlyDeleted(prevDeleted => [{ ...item }, ...prevDeleted].slice(0, 5));

        const subTotal = Number((prev.subTotal - (item?.totalPrice || 0)).toFixed(2));
        const tax = Number((subTotal * (prev.taxPercent / 100)).toFixed(2));
        const next = { 
          ...prev, 
          subTotal, 
          tax, 
          total: subTotal + tax, 
          orderItems: prev.orderItems.filter((_, i) => i !== index) 
        };
        try { generatePdf(next); } catch {}
        return next;
      });
    }
  }, [generatePdf]);

  // MAIN createOrder — now ONLINE-first (server)
  const createOrder = async () => {
    // Prevent double submission
    if (isSubmitting) {
      console.log('Order submission already in progress, ignoring duplicate click');
      return;
    }
    
    // Credit sale validation: customer name is mandatory
    if (isCreditSale && !orderProps.customerName?.trim()) {
      alert("Credit Sale requires a Customer Name to track the due amount.");
      return;
    }
    
    setIsSubmitting(true);
    setSuppressAutoSuggest(true);
    try {
      setLastSubmitError(null);
      setLastSubmitResponse(null);

      if (!orderProps.orderItems || orderProps.orderItems.length === 0) {
        alert("Cannot create invoice: no items in the order.");
        setSuppressAutoSuggest(false);
        setIsSubmitting(false);
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
        setIsSubmitting(false);
        return;
      }

      // SANITIZE before save (pass isCreditSale for payment status)
      const sanitized = sanitizeOrderForServer(orderProps, isCreditSale);

      // ONLINE SAVE (Server)
      const savedOrder = await dispatch(createOrderAction(sanitized));

      // Invalidate RTK Query cache to refresh orders list
      dispatch(api.util.invalidateTags([
        { type: 'Orders', id: 'LIST' },
        { type: 'Receivables', id: 'LIST' },
        { type: 'Dashboard', id: 'TODAY' }
      ]));

      setLastSubmitResponse({
        stage: "online_success",
        note: "Order saved to server",
        orderNumber: savedOrder.orderNumber,
        total: savedOrder.total,
        timestamp: new Date().toISOString(),
      });

      // Note: Daily totals are now tracked server-side only to prevent duplicates

      // Generate and archive PDF with the SAVED order (which has the real invoice number)
      let newPdfUrl = '';
      try { 
        newPdfUrl = await generatePdf(savedOrder); 
      } catch (e) {
        console.error('PDF generation error:', e);
      }
      setArchivedOrderProps(savedOrder);
      setArchivedPdfUrl(newPdfUrl || pdfUrl || "");
      setLastInvoiceTotal(savedOrder.total);
      
      // Save recently submitted order for display until new item is added
      setRecentlySubmittedOrder({
        orderNumber: savedOrder.orderNumber,
        orderDate: savedOrder.orderDate,
        customerName: savedOrder.customerName,
        customerMobile: savedOrder.customerMobile,
        orderItems: savedOrder.orderItems || orderProps.orderItems || [],
        subTotal: savedOrder.subTotal,
        tax: savedOrder.tax,
        total: savedOrder.total,
        pdfUrl: newPdfUrl || pdfUrl || ""
      });

      // refresh history panel
      refreshHistory();

      const paymentMsg = isCreditSale 
        ? `\n⚠️ CREDIT SALE - Due: ₹${savedOrder.total}` 
        : '';
      alert(`✅ Order created successfully!\nOrder #: ${savedOrder.orderNumber}\nTotal: ₹${savedOrder.total}${paymentMsg}`);

      setOrderProps(initialOrderProps);
      formik.resetForm();
      setLocalPriceValue('');
      setFetchedViaScale(false);
      setRecentlyDeleted([]);
      setSelectedHistoryDate('');
      setIsCreditSale(false); // Reset credit sale toggle
      setSelectedProduct(null); // Reset selected product
      setInputValue(''); // Reset input value
      // Note: Keep archivedOrderProps/archivedPdfUrl to show the just-submitted order's PDF
      // User can start adding new items while viewing the submitted PDF
    } catch (err) {
      console.error("createOrder unexpected error:", err);
      setLastSubmitError({ type: "unexpected", message: String(err?.message || err), raw: err });
      alert("Something went wrong while creating the order. Check console / debug area.");
    } finally {
      setSuppressAutoSuggest(false);
      setIsSubmitting(false);
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

  // Show live preview (pdfUrl) when there are items in current order,
  // otherwise show archived PDF from last submitted order
  const hasCurrentOrderItems = orderProps.orderItems && orderProps.orderItems.length > 0;
  const visiblePdfUrl = hasCurrentOrderItems ? pdfUrl : (archivedPdfUrl || pdfUrl);
  const visibleOrderDisplay = archivedOrderProps || orderProps;

  // When price enters 300–399 (and name is set) and user hasn't suppressed, open the modal.
  useEffect(() => {
    if (!modalSuppress && priceValue >= 300 && priceValue <= 399 && Boolean(formik.values.name)) {
      setModalOpen(true);
    }
  }, [priceValue, formik.values.name, modalSuppress]);

  // Reset suppression when price leaves range so it can open again for future products
  useEffect(() => {
    if (!(priceValue >= 300 && priceValue <= 399)) {
      setModalSuppress(false);
    }
  }, [priceValue]);

  // Helper: focus price input inside modal and select last 2 digits
  const focusModalPriceInput = useCallback(() => {
    try {
      const el = modalPriceRef && modalPriceRef.current;
      if (!el || typeof el.focus !== 'function') return;
      el.focus();
      const val = String(el.value || '');
      const len = val.length;
      if (typeof el.setSelectionRange === 'function') {
        if (len >= 3) {
          // lock first digit, select last 2
          el.setSelectionRange(len - 2, len);
        } else if (len >= 1) {
          el.setSelectionRange(0, len);
        } else if (el.select) {
          el.select();
        }
      } else if (el.select) {
        el.select();
      }
    } catch {}
  }, []);

  // When modal opens, focus modal price
  useEffect(() => {
    if (modalOpen) {
      setTimeout(() => {
        focusModalPriceInput();
      }, 150);
    }
  }, [modalOpen, focusModalPriceInput]);

  // When product changes and modal is not open, focus main price
  useEffect(() => {
    if (selectedProduct && !modalOpen) {
      focusMainPriceInput();
    }
  }, [selectedProduct, modalOpen, focusMainPriceInput]);

  const show200sKeypad = isWeighted && priceValue >= 200 && priceValue <= 299;

  const selectedHistoryRow = selectedHistoryDate
    ? dailyHistory.find((r) => r.date === selectedHistoryDate)
    : null;

  return (
    <>
      {/* Guide for Admin Users - Hidden by default */}
      {isAdmin && (
        <Box sx={{ mb: 2 }}>
          <Button 
            size="small" 
            variant="text" 
            onClick={() => setShowAdminGuide(!showAdminGuide)}
            sx={{ color: 'text.secondary', textTransform: 'none' }}
          >
            {showAdminGuide ? '▼ Hide Quick Reference' : '▶ Show Quick Reference'}
          </Button>
          {showAdminGuide && (
            <Alert 
              severity="success" 
              icon={<Info />}
              sx={{ mt: 1, backgroundColor: '#e8f5e9' }}
            >
              <Typography variant="subtitle2" fontWeight="bold">Admin Quick Reference:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Shortcuts:</Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.85rem' }}>
                    <li><Chip label="/" size="small" sx={{ mx: 0.5 }} /> Fetch weight from scale</li>
                    <li><Chip label="=" size="small" sx={{ mx: 0.5 }} /> Add product to order</li>
                    <li><Chip label="Shift+D" size="small" sx={{ mx: 0.5 }} /> Delete last item</li>
                    <li><Chip label="Ctrl+P" size="small" sx={{ mx: 0.5 }} /> Print PDF <Typography component="span" variant="caption" color="text.secondary">(after submit)</Typography></li>
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Price Protection:</Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.85rem' }}>
                    <li>Tens digit blocks <strong>1-5</strong> unless <Chip label="Caps Lock" size="small" color="warning" sx={{ mx: 0.5 }} /> is ON</li>
                    <li>Weighted products: 3-digit only (100-399)</li>
                    <li>Restricted ranges: 200-209, 301-309</li>
                  </Box>
                </Box>
              </Box>
            </Alert>
          )}
        </Box>
      )}

      {/* Guide for Billing Staff */}
      {isBillingStaff && (
        <Alert 
          severity="info" 
          icon={<Info />}
          sx={{ mb: 2 }}
        >
          <Typography variant="subtitle2" fontWeight="bold">Quick Guide:</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            <li><strong>Step 1:</strong> Select product from dropdown → Price auto-fills</li>
            <li><strong>Step 2:</strong> Edit price if needed → Press <Chip label="Add" size="small" color="primary" sx={{ mx: 0.5 }} /> or <Chip label="Enter" size="small" sx={{ mx: 0.5 }} /></li>
            <li><strong>Step 3:</strong> Repeat for all items → Click <Chip label="Create Invoice" size="small" color="success" sx={{ mx: 0.5 }} /></li>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            💰 For payments: Go to <strong>Daily Payments</strong> page from menu
          </Typography>
        </Alert>
      )}

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
              {/* Credit Sale Toggle - Prominent Position */}
              <Grid item xs={12}>
                <Box 
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 2,
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: isCreditSale ? '#fff3e0' : '#e8f5e9',
                    border: isCreditSale ? '2px solid #ff9800' : '1px solid #4caf50'
                  }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        checked={isCreditSale}
                        onChange={(e) => {
                          if (e.target.checked) {
                            // Show confirmation prompt when enabling credit sale
                            const confirmed = window.confirm(
                              "⚠️ CREDIT SALE WARNING\n\n" +
                              "This order will be marked as UNPAID.\n\n" +
                              "• Customer name is REQUIRED\n" +
                              "• Amount will be added to receivables\n" +
                              "• This will NOT be counted as cash in drawer\n\n" +
                              "Are you sure you want to create a credit sale?"
                            );
                            if (confirmed) {
                              setIsCreditSale(true);
                            }
                          } else {
                            setIsCreditSale(false);
                          }
                        }}
                        color="warning"
                      />
                    }
                    label={
                      <Typography variant="subtitle2" fontWeight="bold">
                        {isCreditSale ? '⚠️ CREDIT SALE (Unpaid)' : '✅ CASH SALE (Paid)'}
                      </Typography>
                    }
                  />
                  {isCreditSale && (
                    <Typography variant="caption" color="warning.dark">
                      Customer name required • Amount added to receivables • Not counted as cash in drawer
                    </Typography>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField 
                  size="small" 
                  id="customerName" 
                  name="customerName" 
                  label={isCreditSale ? "Customer Name *" : "Customer Name"} 
                  value={orderProps.customerName} 
                  onChange={(e)=>{ const { id, value } = e.target; setOrderProps((prevProps) => ({ ...prevProps, [id]: value })); }} 
                  required={isCreditSale}
                  error={isCreditSale && !orderProps.customerName}
                  helperText={isCreditSale && !orderProps.customerName ? "Required for credit sale" : ""}
                  fullWidth 
                  sx={isCreditSale ? { '& .MuiOutlinedInput-root': { borderColor: 'warning.main' } } : {}}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField size="small" id="customerMobile" name="customerMobile" label="Customer Mobile" value={orderProps.customerMobile} onChange={(e)=>{ const { id, value } = e.target; setOrderProps((prevProps) => ({ ...prevProps, [id]: value })); }} fullWidth />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField size="small" type='number' id="taxPercent" name="taxPercent" label="Tax Percentage" value={orderProps.taxPercent} onChange={(e)=>{ const { id, value } = e.target; const obj = {}; if (id === 'taxPercent') { const taxPct = Number(value) || 0; obj['taxPercent'] = taxPct; const subTotal = orderProps.subTotal; obj['tax'] = Math.round(subTotal * (taxPct / 100)); obj['total'] = subTotal + obj['tax']; } setOrderProps((prevProps) => ({ ...prevProps, [id]: value, ...obj })); }} required fullWidth />
              </Grid>

              <Grid item xs={12} md={6} mt={2}>
                <Autocomplete
                  size="small"
                  options={customerOptions}
                  value={orderProps.customer || null}
                  onChange={(_, val) => {
                    // Auto-fill customerName and customerMobile when a customer is selected
                    setOrderProps(prev => ({
                      ...prev, 
                      customer: val,
                      customerName: val?.name || prev.customerName || '',
                      customerMobile: val?.mobile || prev.customerMobile || ''
                    }));
                  }}
                  renderInput={(params) => (
                    <TextField 
                      {...params} 
                      label="Select Customer from Database" 
                      placeholder="Type to search customers..."
                    />
                  )}
                  getOptionLabel={(opt) => opt?.label || ''}
                  isOptionEqualToValue={(o, v) => (o?.id ?? o?._id ?? o?.label) === (v?.id ?? v?._id ?? v?.label)}
                  freeSolo
                  filterOptions={(options, { inputValue }) => {
                    const filtered = options.filter(opt => 
                      opt.label?.toLowerCase().includes(inputValue.toLowerCase()) ||
                      opt.name?.toLowerCase().includes(inputValue.toLowerCase()) ||
                      opt.mobile?.includes(inputValue)
                    );
                    return filtered.slice(0, 10); // Limit to 10 suggestions
                  }}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id || option._id || option.label}>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">{option.name}</Typography>
                        {option.mobile && (
                          <Typography variant="caption" color="text.secondary">
                            📱 {option.mobile}
                          </Typography>
                        )}
                      </Box>
                    </li>
                  )}
                  noOptionsText="No customers found. Enter name manually above."
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

              {/* Switch to control usage of product named 'add' */}
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={allowAddProductName}
                      onChange={(e) => setAllowAddProductName(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Allow using product named 'add'"
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Quick Select:</Typography>

                {/* Only /dabba button, centered */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    py: 0.5
                  }}
                >
                  <Button
                    size="large"
                    variant={quickVariant('dabba')}
                    sx={{
                      px: 4,
                      py: 1.5,
                      ...(selectedQuick === 'dabba' && HIGHLIGHT_SX)
                    }}
                    color="success"
                    onClick={async () => {
                      const product = productOptions.find(p => p.label.toLowerCase().includes('dabba'));
                      if (product) {
                        setSelectedQuick('dabba');
                        setSelectedProduct(product);
                        setInputValue(product.label || product.value || '');
                        setHighlightedQuickProduct('dabba');
                        await attemptProductChange(product);
                        await onProductSelect(null, product);
                      } else { alert("Product '/dabba' not found"); }
                    }}
                  >
                    {'1. /dabba'}
                  </Button>
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

              {/* Toggle for "Y" and "PRODUCT X" to allow/block original price - shown in main form */}
              {isNoPriceProduct(formik.values.name) && originalPriceForSpecial !== null && (
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={allowOriginalPrice}
                        onChange={(e) => setAllowOriginalPrice(e.target.checked)}
                        color="warning"
                      />
                    }
                    label={`Allow Original Price (₹${originalPriceForSpecial})`}
                    sx={{ 
                      backgroundColor: allowOriginalPrice ? '#fff3e0' : '#ffebee',
                      borderRadius: 1,
                      px: 1,
                      py: 0.5,
                      border: allowOriginalPrice ? '1px solid #ff9800' : '1px solid #f44336'
                    }}
                  />
                </Grid>
              )}

              <Grid item xs={12} md={6}>
                <TextField
                  key={`price-input-${formik.values.id || 'empty'}`}
                  type="text"
                  size="small"
                  id="productPrice"
                  name="productPrice" 
                  label={isWeighted ? "Product Price (3-digit: 100-399)" : "Product Price"}
                  value={localPriceValue}
                  onChange={onPriceChange}
                  onFocus={onPriceFocus}
                  onBlur={onPriceBlur}
                  onPaste={onPasteHandler}
                  required
                  fullWidth
                  error={
                    (Boolean(isWeightedPriceInvalid) && localPriceValue !== "") ||
                    (isNoPriceProduct(formik.values.name) && originalPriceForSpecial !== null && !allowOriginalPrice && Number(localPriceValue) === originalPriceForSpecial)
                  }
                  helperText={
                    isNoPriceProduct(formik.values.name) && originalPriceForSpecial !== null && !allowOriginalPrice && Number(localPriceValue) === originalPriceForSpecial
                      ? `⚠️ Cannot use original price (₹${originalPriceForSpecial}) - please edit`
                      : isWeighted && localPriceValue !== "" 
                        ? (isWeightedPriceInvalid 
                            ? 'Must be 3 digits (100-399)' 
                            : computedPriceRange 
                              ? `Range: ₹${computedPriceRange}` 
                              : '')
                        : ''
                  }
                  inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', step: 1 }}
                  onKeyDown={onPriceKeyDown}
                  inputRef={priceInputRef}
                  InputProps={{
                    endAdornment: (
                      <Box sx={{ display: 'flex', flexDirection: 'column', ml: 0.3 }}>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => adjustPriceByStep(1, priceInputRef)}
                          sx={{ minWidth: 0, p: 0, lineHeight: 1, fontSize: '0.65rem' }}
                        >
                          ▲
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => adjustPriceByStep(-1, priceInputRef)}
                          sx={{ minWidth: 0, p: 0, lineHeight: 1, fontSize: '0.65rem' }}
                        >
                          ▼
                        </Button>
                      </Box>
                    )
                  }}
                />
                {/* Virtual keypad for 200–299 range: digits 6,7,8,9 */}
                {show200sKeypad && !modalOpen && (
                  <Box sx={{ mt: 0.5, display: 'flex', gap: 1 }}>
                    {[6, 7, 8, 9].map((d) => (
                      <Button
                        key={d}
                        size="small"
                        variant="outlined"
                        onClick={() => applyDigitToPrice(d, priceInputRef)}
                      >
                        {d}
                      </Button>
                    ))}
                  </Box>
                )}
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
                  size="small"
                  type="number"
                  id="quantity"
                  name="quantity"
                  label="Quantity (Kg)"
                  value={formik.values.quantity}
                  onChange={onQuantityChange}
                  required
                  fullWidth
                  error={Boolean(formik.errors?.quantity)}
                  helperText={formik.errors?.quantity}
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
                <Button variant="contained" onClick={createOrder} sx={{ float: "right", margin: "5px" }} disabled={orderProps.orderItems.length === 0 || isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
                <Button
                  variant="contained"
                  onClick={addProductHandler}
                  sx={{ float: "right", margin: "5px" }}
                  disabled={
                    formik.values.name === "" ||
                    (!allowAddProductName && isAddName(formik.values.name)) ||
                    (isWeighted && (formik.values.productPrice === "" || isWeightedPriceInvalid))
                  }
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

          {/* Recently deleted items list */}
          {recentlyDeleted.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Recently deleted items
              </Typography>
              {recentlyDeleted.map((item, idx) => (
                <Card key={idx} sx={{ padding: '4px 10px', margin: '3px 1px', backgroundColor: '#fff8e1' }}>
                  <Grid container alignItems="center">
                    <Grid item xs={8}>
                      <Typography variant="body2">
                        {safeGetProductName(rows, item)} | Qty: {item.quantity} | Price: {item.totalPrice}
                      </Typography>
                    </Grid>
                    <Grid item xs={4} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => restoreDeletedItem(idx)}
                      >
                        Restore
                      </Button>
                    </Grid>
                  </Grid>
                </Card>
              ))}
            </Box>
          )}
        </Grid>

        <Grid item xs={12} sm={6}>
          <Box sx={{ height: '90vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">Order #: {visibleOrderDisplay?.orderNumber}</Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography variant="subtitle2">Last Invoice: {lastInvoiceTotal != null ? `₹ ${Number(lastInvoiceTotal).toLocaleString('en-IN')}` : '—'}</Typography>
              </Box>
              {archivedOrderProps && (
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={printPdf}
                  title='Print PDF'
                >
                  Print PDF
                </Button>
              )}
            </Box>

            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              {visiblePdfUrl ? (
                <>
                  {archivedOrderProps && (
                    <Box sx={{ mb: 1, display: 'flex', gap: 1 }}>
                      <Button 
                        size="small" 
                        variant="outlined"
                        onClick={() => window.open(visiblePdfUrl, '_blank')}
                      >
                        Open PDF in New Tab
                      </Button>
                    </Box>
                  )}
                  <Box sx={{ flexGrow: 1, '& iframe, & embed, & object': { width: '100%', height: '100%', border: 'none' } }}>
                    <object
                      key={visiblePdfUrl}
                      data={`${visiblePdfUrl}#toolbar=0&navpanes=0`}
                      type="application/pdf"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <iframe 
                        key={`iframe-${visiblePdfUrl}`}
                        ref={pdfRef} 
                        src={archivedOrderProps ? visiblePdfUrl : `${visiblePdfUrl}#toolbar=0`} 
                        title='Invoice'
                        style={{ width: '100%', height: '100%', border: 'none' }}
                      />
                    </object>
                  </Box>
                </>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                  <Typography>Add products to preview invoice</Typography>
                </Box>
              )}
            </Box>

            {/* Past Totals Panel (now privacy-friendly dropdown) */}
            <Card sx={{ mt: 1 }}>
              <CardContent sx={{ py: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle2">Past totals (saved locally)</Typography>
                  <Button size="small" onClick={refreshHistory}>Refresh</Button>
                </Box>
                {dailyHistory.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No past invoices found.
                  </Typography>
                ) : (
                  <>
                    <Select
                      size="small"
                      fullWidth
                      displayEmpty
                      value={selectedHistoryDate}
                      onChange={(e) => setSelectedHistoryDate(e.target.value)}
                      sx={{ mt: 0.5, mb: 1 }}
                    >
                      <MenuItem value="" disabled>
                        Select date to view total
                      </MenuItem>
                      {dailyHistory.map((row) => (
                        <MenuItem key={row.date} value={row.date}>
                          {row.date}
                        </MenuItem>
                      ))}
                    </Select>
                    {selectedHistoryRow && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2">Date: {selectedHistoryRow.date}</Typography>
                        <Typography variant="body2">Bills: {selectedHistoryRow.count}</Typography>
                        <Typography variant="body2">
                          Total: ₹ {Number(selectedHistoryRow.total).toLocaleString('en-IN')}
                        </Typography>
                      </Box>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Tens digit protection toggle - discreet placement */}
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', opacity: 0.5 }}>
              <Button
                size="small"
                variant={tensDigitProtection ? "contained" : "outlined"}
                color={tensDigitProtection ? "primary" : "inherit"}
                onClick={() => setTensDigitProtection(!tensDigitProtection)}
                sx={{ fontSize: '0.65rem', py: 0.25, px: 1, minWidth: 'auto' }}
              >
                {tensDigitProtection ? '₹X50+' : '₹X00+'}
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Modal for distraction-free editing when price is 300-399 */}
      <Dialog
        open={Boolean(modalOpen)}
        onClose={() => {
          setModalOpen(false);
          setModalSuppress(true);
        }}
        fullScreen
        PaperProps={{
          sx: {
            backgroundColor: '#ffffff',
            width: '100%',
            height: '100%',
            margin: 0,
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            p: 2
          }
        }}
        BackdropProps={{ invisible: false }}
        TransitionProps={{
          onEntered: () => {
            // When the dialog transition finishes, force focus on price input
            focusModalPriceInput();
          }
        }}
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
            
            {/* Toggle for "Y" and "PRODUCT X" to allow/block original price */}
            {isNoPriceProduct(formik.values.name) && originalPriceForSpecial !== null && (
              <FormControlLabel
                control={
                  <Switch
                    checked={allowOriginalPrice}
                    onChange={(e) => setAllowOriginalPrice(e.target.checked)}
                    color="warning"
                  />
                }
                label={`Allow Original Price (₹${originalPriceForSpecial})`}
                sx={{ 
                  backgroundColor: allowOriginalPrice ? '#fff3e0' : '#ffebee',
                  borderRadius: 1,
                  px: 1,
                  py: 0.5,
                  border: allowOriginalPrice ? '1px solid #ff9800' : '1px solid #f44336'
                }}
              />
            )}
            
            <TextField
              inputRef={modalPriceRef}
              size="small"
              label="Product Price"
              type="text"
              value={localPriceValue}
              onChange={onPriceChange}
              onKeyDown={onPriceKeyDown}
              onPaste={onPasteHandler}
              helperText={
                isNoPriceProduct(formik.values.name) && originalPriceForSpecial !== null && !allowOriginalPrice && Number(localPriceValue) === originalPriceForSpecial
                  ? `⚠️ Cannot use original price (₹${originalPriceForSpecial}) - please edit`
                  : isWeighted ? (isWeightedPriceInvalid ? 'Must be 3 digits (100-399)' : (computedPriceRange ? `Range: ₹${computedPriceRange}` : '')) : ''
              }
              error={isNoPriceProduct(formik.values.name) && originalPriceForSpecial !== null && !allowOriginalPrice && Number(localPriceValue) === originalPriceForSpecial}
              fullWidth
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', step: 1 }}
              InputProps={{
                endAdornment: (
                  <Box sx={{ display: 'flex', flexDirection: 'column', ml: 0.3 }}>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => adjustPriceByStep(1, modalPriceRef)}
                      sx={{ minWidth: 0, p: 0, lineHeight: 1, fontSize: '0.65rem' }}
                    >
                      ▲
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => adjustPriceByStep(-1, modalPriceRef)}
                      sx={{ minWidth: 0, p: 0, lineHeight: 1, fontSize: '0.65rem' }}
                    >
                      ▼
                    </Button>
                  </Box>
                )
              }}
            />
            {/* Virtual keypad in modal for 300–399: digits 6,7,8,9 */}
            {priceValue >= 300 && priceValue <= 399 && (
              <Box sx={{ mt: 0.5, mb: 1, display: 'flex', gap: 1 }}>
                {[6, 7, 8, 9].map((d) => (
                  <Button
                    key={d}
                    size="small"
                    variant="outlined"
                    onClick={() => applyDigitToPrice(d, modalPriceRef)}
                  >
                    {d}
                  </Button>
                ))}
              </Box>
            )}
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
          <Button
            onClick={() => {
              setModalOpen(false);
              setModalSuppress(true);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              addProductHandler();
              setModalOpen(false);
              setModalSuppress(false);
            }}
            variant="contained"
            disabled={
              formik.values.name === "" ||
              (!allowAddProductName && isAddName(formik.values.name)) ||
              (isWeighted && (formik.values.productPrice === "" || isWeightedPriceInvalid))
            }
          >
            Add Product
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
