import moment from 'moment/moment';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useFormik } from "formik";
import { useDispatch, useSelector } from 'react-redux';
import { Autocomplete, Box, Button, Card, CardContent, Grid, TextField, Typography, Select, MenuItem, Divider } from '@mui/material';
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

  const [selectedQuick, setSelectedQuick] = useState('');
  const clearQuickHighlight = () => setSelectedQuick('');
  // eslint-disable-next-line no-unused-vars
  const [highlightedQuickProduct, setHighlightedQuickProduct] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const quickVariant = (tag) => (selectedQuick === tag || highlightedQuickProduct === tag ? 'contained' : 'outlined');

  const [template, setTemplate] = useState(1);
  const TEMPLATE_MAP = useMemo(() => ({ 1: 2, 2: 1 }), []);

  const [archivedOrderProps, setArchivedOrderProps] = useState(null);
  const [archivedPdfUrl, setArchivedPdfUrl] = useState('');

  // eslint-disable-next-line no-unused-vars
  const [lastSubmitError, setLastSubmitError] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [lastSubmitResponse, setLastSubmitResponse] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [lastInvoiceTotal, setLastInvoiceTotal] = useState(null);

  const [suppressAutoSuggest, setSuppressAutoSuggest] = useState(false);

  const [dabbaLock, setDabbaLock] = useState(false);
  const [dabbaProductId, setDabbaProductId] = useState(null);
  const [priceLock, setPriceLock] = useState(false);
  const [priceLockProductId, setPriceLockProductId] = useState(null);
  const [bowlPriceLock, setBowlPriceLock] = useState(false);
  const [bowlProductIdLocked, setBowlProductIdLocked] = useState(null);

  const [fetchedViaScale, setFetchedViaScale] = useState(false);

  // NEW: Past totals (history)
  // eslint-disable-next-line no-unused-vars
  const [dailyHistory, setDailyHistory] = useState([]);
  const refreshHistory = useCallback(() => {
    const inv = loadAllInvoices();
    setDailyHistory(computeDailyTotalsFromInvoices(inv));
  }, []);

  // eslint-disable-next-line no-unused-vars
  const printPdf = useCallback(() => {
    try {
      if (!pdfUrl && !archivedPdfUrl) return;
      const frame = pdfRef.current;
      if (frame && frame.contentWindow) { frame.contentWindow.focus(); frame.contentWindow.print(); return; }
      const w = window.open(archivedPdfUrl || pdfUrl);
      if (w) { const onLoad = () => { try { w.print(); } catch {} }; w.addEventListener('load', onLoad, { once: true }); }
    } catch {}
  }, [pdfUrl, archivedPdfUrl]);

  const safeGetProductName=(rowsObj,item)=>{ const row=rowsObj&&item?rowsObj[item.productId]:undefined; return (row&&row.name)||item?.name||'ITEM'; };

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
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [isNameAdd, setIsNameAdd] = useState(false);
  const [isWeighted, setIsWeighted] = useState(false);
  const [isWeightReadOnly, setIsWeightReadOnly] = useState(false);
  const [isBowl, setIsBowl] = useState(false);
  const [isBowlReadOnly, setIsBowlReadOnly] = useState(false);
  const [showHighValueModal, setShowHighValueModal] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [highValueProductId, setHighValueProductId] = useState(null);

  // eslint-disable-next-line no-unused-vars
  const [todayGrandTotal, setTodayGrandTotal] = useState(getTodayGrandTotal());

  const isAddProduct = useMemo(() => (
    (formik.values.name || '').toLowerCase() === 'add'
  ), [formik.values.name]);

  const isFormValid = useMemo(() => {
    if (isNameAdd) return Boolean(formik.values.altName && formik.values.productPrice);
    if (isAddProduct) return Boolean(formik.values.altName && formik.values.productPrice);
    if (isWeighted) return Boolean(formik.values.id && formik.values.quantity && formik.values.productPrice);
    return Boolean(formik.values.id && formik.values.quantity && formik.values.productPrice);
  }, [isNameAdd, isAddProduct, isWeighted, formik.values.id, formik.values.quantity, formik.values.productPrice, formik.values.altName]);

  const resetForm = useCallback(() => {
    formik.resetForm();
    setSelectedProduct(null);
    setInputValue('');
    setIsNameAdd(false);
    setIsWeighted(false);
    setIsWeightReadOnly(false);
    setIsBowl(false);
    setIsBowlReadOnly(false);
    setDabbaLock(false);
    setDabbaProductId(null);
    setPriceLock(false);
    setPriceLockProductId(null);
    setBowlPriceLock(false);
    setBowlProductIdLocked(null);
    setFetchedViaScale(false);
    setShowHighValueModal(false);
    setHighValueProductId(null);
    setSuppressAutoSuggest(false);
    lastAddSucceededRef.current = false;
  }, [formik]);

  const formik = useFormik({
    initialValues: {
      id: "",
      name: "",
      type: "",
      productPrice: "",
      quantity: "",
      totalPrice: 0,
      altName: "",
    },
    onSubmit: (values) => {
      // Handled by addProductHandler
    },
  });

  // eslint-disable-next-line no-unused-vars
  function formikSafeGet(field) {
    return formik.values[field];
  }

  const weighingScaleHandler = useCallback(async () => {
    // Mock implementation for weighing scale integration
    // In a real app, this would involve an API call to a local service
    // For now, we'll simulate a prompt for weight
    const product = rows[formik.values.id];
    if (!product) return false;

    const weight = prompt(`Enter weight for ${product.name} (in kg):`);
    const numericWeight = Number(weight);

    if (Number.isFinite(numericWeight) && numericWeight > 0) {
      formik.setFieldValue('quantity', numericWeight);
      const price = Number(formik.values.productPrice) || 0;
      formik.setFieldValue('totalPrice', Number((price * numericWeight).toFixed(2)));
      setFetchedViaScale(true);
      return true;
    } else if (weight !== null) {
      alert('Invalid weight entered. Please try again.');
      return false;
    }
    return false;
  }, [formik, rows]);

  const onProductSelect = useCallback(async (event, value) => {
    const productId = value?.productId;
    setSelectedProduct(value);
    setInputValue(value?.label || '');
    clearQuickHighlight();

    if (productId) {
      const product = rows[productId];
      if (!product) return;

      const isDabba = (product.name || '').toLowerCase().includes('dabba');
      if (isDabba) {
        setDabbaLock(true);
        setDabbaProductId(productId);
      } else {
        setDabbaLock(false);
        setDabbaProductId(null);
      }

      if (dabbaLock && productId !== dabbaProductId) {
        alert('Product switching is locked because you selected dabba. Add the dabba product first. After it is added press Shift+J to unlock.');
        setSelectedProduct(null);
        setInputValue('');
        formik.resetForm();
        setDabbaLock(true);
        setDabbaProductId(dabbaProductId);
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

      try {
        if (Number(price) === 300) {
          const alreadyAdded = orderProps.orderItems.some(it => String(it.productId) === String(productId));
          if (!alreadyAdded) {
            setPriceLock(true);
            setPriceLockProductId(productId);
          }
        }
      } catch {}

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
          if (bp >= 100 && bp <= 999) {
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
  }, [dabbaLock, dabbaProductId, priceLock, priceLockProductId, selectedProduct, formik, rows, orderProps.orderItems, weighingScaleHandler]);

  // eslint-disable-next-line no-unused-vars
  const attemptProductChange = useCallback(async (value) => {
    if (dabbaLock && value && value.productId !== dabbaProductId) {
      alert('Product switching is locked because you selected dabba. Add the dabba product first. After it is added press Shift+J to unlock.');
      return;
    }
    if (priceLock && value && value.productId !== priceLockProductId) {
      alert('Product switching is locked because selected product has price 300. Add it first or press Shift+J to unlock.');
      return;
    }

    const currentlySelected = selectedProduct;
    const currentNameFilled = !!(formik.values.name);
    const currentNotAdded = !orderProps.orderItems.some(item => item.productId === formik.values.id);

    if (currentlySelected && value && value.productId !== currentlySelected.productId && currentNameFilled && currentNotAdded) {
      const ok = window.confirm('Are you sure you want to change product? You have not added the current selection.');
      if (!ok) return;
    }

    try { await onProductSelect(null, value); } catch {}
  }, [dabbaLock, dabbaProductId, priceLock, priceLockProductId, selectedProduct, formik.values.name, formik.values.id, orderProps.orderItems, onProductSelect]);

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

      if (!isFormValid) {
        alert('Please fill all required fields.');
        return;
      }

      const newItems = [...orderProps.orderItems];
      const newItem = {
        productId: formik.values.id,
        name: formik.values.name,
        type: formik.values.type,
        productPrice: Number(formik.values.productPrice),
        quantity: Number(formik.values.quantity),
        totalPrice: Number(formik.values.totalPrice),
        altName: formik.values.altName,
      };

      if (isNameAdd || isAddProduct) {
        newItems.push(newItem);
      } else {
        const existingIndex = newItems.findIndex(item => item.productId === newItem.productId);
        if (existingIndex !== -1) {
          const existing = newItems[existingIndex];
          existing.quantity += newItem.quantity;
          existing.totalPrice += newItem.totalPrice;
        } else {
          newItems.push(newItem);
        }
      }

      const newOrderProps = { ...orderProps, orderItems: newItems };
      const totals = recomputeTotals(newOrderProps);
      const finalOrderProps = { ...newOrderProps, ...totals };

      setOrderProps(finalOrderProps);
      generatePdf(finalOrderProps);
      resetForm();
      lastAddSucceededRef.current = true;
    } catch (e) {
      console.error('Error adding product:', e);
      alert('Failed to add product. Check console for details.');
    }
  }, [isFormValid, isNameAdd, isAddProduct, formik.values, orderProps, generatePdf, resetForm]);

  const removeProductHandler = useCallback((index) => {
    const newItems = orderProps.orderItems.filter((_, i) => i !== index);
    const newOrderProps = { ...orderProps, orderItems: newItems };
    const totals = recomputeTotals(newOrderProps);
    const finalOrderProps = { ...newOrderProps, ...totals };
    setOrderProps(finalOrderProps);
    generatePdf(finalOrderProps);
  }, [orderProps, generatePdf]);

  const saveOrderHandler = useCallback(async () => {
    try {
      if (orderProps.orderItems.length === 0) {
        alert('Cannot save an empty order.');
        return;
      }

      const savedOrder = saveOrderLocal(orderProps);
      addToTodayGrandTotal(savedOrder.total);

      // Reset UI state
      setOrderProps(initialOrderProps);
      setPdfUrl('');
      setArchivedOrderProps(null);
      setArchivedPdfUrl('');
      resetForm();

      // Show success message and print
      alert(`Order ${savedOrder.orderNumber} saved successfully! Total: ${savedOrder.total}`);
      // printPdf(); // Auto-print is commented out for now
    } catch (e) {
      console.error('Error saving order:', e);
      alert('Failed to save order. Check console for details.');
    }
  }, [orderProps, initialOrderProps, resetForm]);

  const handleQuickSelect = useCallback((tag) => {
    const product = productOptions.find(p => p.label.includes(tag.toUpperCase()));
    if (product) {
      onProductSelect(null, product);
    }
  }, [productOptions, onProductSelect]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === '=') {
      if (showHighValueModal) {
        // Confirm modal
        setShowHighValueModal(false);
        addProductHandler();
        e.preventDefault();
      } else if (isFormValid) {
        // Submit form
        addProductHandler();
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      if (showHighValueModal) {
        setShowHighValueModal(false);
        e.preventDefault();
      } else {
        resetForm();
        e.preventDefault();
      }
    } else if (e.key === '1' && !isFormValid && !selectedProduct) {
      // Auto-add bowl feature (removed as per user request, but keeping the structure)
      // const bowlProduct = productOptions.find(p => p.label.includes('BOWL'));
      // if (bowlProduct) {
      //   onProductSelect(null, bowlProduct);
      //   e.preventDefault();
      // }
    } else if (e.key === 'J' && e.shiftKey) {
      // Shift+J unlock logic (removed as per user request, but keeping the structure)
      // setDabbaLock(false);
      // setDabbaProductId(null);
      // setPriceLock(false);
      // setPriceLockProductId(null);
      // alert('Product lock released.');
      // e.preventDefault();
    }
  }, [showHighValueModal, isFormValid, selectedProduct, addProductHandler, resetForm]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // useEffect for high value modal
  useEffect(() => {
    if (lastAddSucceededRef.current) {
      const lastItem = orderProps.orderItems[orderProps.orderItems.length - 1];
      if (lastItem && lastItem.totalPrice >= 300 && lastItem.totalPrice <= 999) {
        setShowHighValueModal(true);
        setHighValueProductId(lastItem.productId);
      }
    }
  }, [orderProps.orderItems]);

  // useEffect for auto-refreshing history
  useEffect(() => {
    refreshHistory();
    const timer = setInterval(refreshHistory, 60000); // Refresh every minute
    const eventListener = () => refreshHistory();
    window.addEventListener('INVOICES_UPDATED', eventListener);
    window.addEventListener('DAY_TOTAL_UPDATED', eventListener);
    return () => {
      clearInterval(timer);
      window.removeEventListener('INVOICES_UPDATED', eventListener);
      window.removeEventListener('DAY_TOTAL_UPDATED', eventListener);
    };
  }, [refreshHistory]);

  // useEffect for today's grand total
  useEffect(() => {
    const eventListener = (e) => {
      setTodayGrandTotal(e.detail);
    };
    window.addEventListener('DAY_TOTAL_UPDATED', eventListener);
    return () => window.removeEventListener('DAY_TOTAL_UPDATED', eventListener);
  }, []);

  // eslint-disable-next-line no-unused-vars
  const onTemplateChange = useCallback((e) => {
    setTemplate(e.target.value);
    if (orderProps.orderItems.length > 0) {
      generatePdf(orderProps);
    }
  }, [orderProps, generatePdf]);

  // eslint-disable-next-line no-unused-vars
  const onArchiveSelect = useCallback((e) => {
    const order = e.target.value;
    if (order) {
      setArchivedOrderProps(order);
      const chosen = TEMPLATE_MAP[template] ?? template;
      const pdfObject = chosen === 1 ? generatePdfDefinition(order) : generatePdfDefinition2(order);
      pdfMake.createPdf(pdfObject).getBlob((blob) => { const url = URL.createObjectURL(blob); setArchivedPdfUrl(url); });
    } else {
      setArchivedOrderProps(null);
      setArchivedPdfUrl('');
    }
  }, [template, TEMPLATE_MAP]);

  // eslint-disable-next-line no-unused-vars
  const submitOrder = useCallback(async () => {
    try {
      if (orderProps.orderItems.length === 0) {
        alert('Cannot submit an empty order.');
        return;
      }

      // Simulate API call to submit order
      await new Promise(resolve => setTimeout(resolve, 500)); 

      // On success
      const savedOrder = saveOrderLocal(orderProps);
      addToTodayGrandTotal(savedOrder.total);

      // Reset UI state
      setOrderProps(initialOrderProps);
      setPdfUrl('');
      setArchivedOrderProps(null);
      setArchivedPdfUrl('');
      resetForm();

      // Show success message and print
      setLastSubmitResponse({ success: true, orderNumber: savedOrder.orderNumber, total: savedOrder.total });
      setLastInvoiceTotal(savedOrder.total);
      // printPdf(); // Auto-print is commented out for now

    } catch (err) {
      console.error('Error submitting order:', err);
      setLastSubmitError({ type: "unexpected", message: String(err?.message || err), raw: err });
      alert("Something went wrong while creating the order. Check console / debug area.");
    } finally {
      setSuppressAutoSuggest(false);
    }
  }, [orderProps, initialOrderProps, resetForm]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const generatePdfWithDeps = useCallback(() => generatePdf(orderProps), [orderProps, generatePdf]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const removeProductHandlerWithDeps = useCallback((index) => removeProductHandler(index), [removeProductHandler]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saveOrderHandlerWithDeps = useCallback(() => saveOrderHandler(), [saveOrderHandler]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const submitOrderWithDeps = useCallback(() => submitOrder(), [submitOrder]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleQuickSelectWithDeps = useCallback((tag) => handleQuickSelect(tag), [handleQuickSelect]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onTemplateChangeWithDeps = useCallback((e) => onTemplateChange(e), [onTemplateChange]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onArchiveSelectWithDeps = useCallback((e) => onArchiveSelect(e), [onArchiveSelect]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const printPdfWithDeps = useCallback(() => printPdf(), [printPdf]);

  return (
    <Box sx={{ p: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h4" gutterBottom>
            Create New Order
          </Typography>
          <Grid container spacing={3}>
            {/* Customer Info */}
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="Customer Name"
                name="customerName"
                value={orderProps.customerName}
                onChange={(e) => setOrderProps({ ...orderProps, customerName: e.target.value })}
                variant="outlined"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="Customer Mobile"
                name="customerMobile"
                value={orderProps.customerMobile}
                onChange={(e) => setOrderProps({ ...orderProps, customerMobile: e.target.value })}
                variant="outlined"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Autocomplete
                fullWidth
                options={customerOptions}
                getOptionLabel={(option) => option.label}
                value={orderProps.customer}
                onChange={(event, newValue) => {
                  setOrderProps({
                    ...orderProps,
                    customer: newValue,
                    customerName: newValue?.name || newValue?.title || '',
                    customerMobile: newValue?.mobile || '',
                  });
                }}
                renderInput={(params) => <TextField {...params} label="Select Customer" variant="outlined" />}
              />
            </Grid>

            {/* Tax and Notes */}
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                label="Tax Percent (%)"
                name="taxPercent"
                type="number"
                value={orderProps.taxPercent}
                onChange={(e) => {
                  const newTaxPercent = Number(e.target.value) || 0;
                  const newOrderProps = { ...orderProps, taxPercent: newTaxPercent };
                  const totals = recomputeTotals(newOrderProps);
                  setOrderProps({ ...newOrderProps, ...totals });
                }}
                variant="outlined"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={8}>
              <TextField
                fullWidth
                label="Notes"
                name="notes"
                value={orderProps.notes}
                onChange={(e) => setOrderProps({ ...orderProps, notes: e.target.value })}
                variant="outlined"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h5" gutterBottom>
            Add Product
          </Typography>
          <form onSubmit={formik.handleSubmit}>
            <Grid container spacing={3}>
              {/* Product Selection */}
              <Grid item xs={12} sm={6} md={4}>
                <Autocomplete
                  fullWidth
                  options={productOptions}
                  getOptionLabel={(option) => option.label}
                  value={selectedProduct}
                  onChange={onProductSelect}
                  inputValue={inputValue}
                  onInputChange={(event, newInputValue) => {
                    setInputValue(newInputValue);
                    if (newInputValue.toLowerCase() === 'add') {
                      setIsNameAdd(true);
                      formik.setFieldValue('name', 'ADD');
                      formik.setFieldValue('id', 'ADD');
                      formik.setFieldValue('type', 'ADD');
                      formik.setFieldValue('productPrice', '');
                      formik.setFieldValue('quantity', '');
                      formik.setFieldValue('totalPrice', 0);
                      formik.setFieldValue('altName', '');
                    } else {
                      setIsNameAdd(false);
                      formik.setFieldValue('name', '');
                      formik.setFieldValue('id', '');
                      formik.setFieldValue('type', '');
                      formik.setFieldValue('altName', '');
                    }
                  }}
                  renderInput={(params) => <TextField {...params} label="Select Product" variant="outlined" />}
                />
              </Grid>

              {/* Alt Name for ADD */}
              {isNameAdd && (
                <Grid item xs={12} sm={6} md={4}>
                  <TextField
                    fullWidth
                    label="Product Name (for ADD)"
                    name="altName"
                    value={formik.values.altName}
                    onChange={formik.handleChange}
                    variant="outlined"
                  />
                </Grid>
              )}

              {/* Price */}
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Price"
                  name="productPrice"
                  type="number"
                  value={formik.values.productPrice}
                  onFocus={onPriceFocus}
                  onKeyDown={onPriceKeyDown}
                  onChange={onPriceChange}
                  onBlur={onPriceBlur}
                  onPaste={onPasteHandler}
                  variant="outlined"
                  inputProps={{
                    step: "0.01",
                    min: "0",
                    readOnly: isWeightReadOnly,
                  }}
                  sx={priceLock ? HIGHLIGHT_SX : {}}
                />
              </Grid>

              {/* Quantity */}
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label={isWeighted ? "Weight (kg)" : "Quantity"}
                  name="quantity"
                  type="number"
                  value={formik.values.quantity}
                  onChange={onQuantityChange}
                  variant="outlined"
                  inputProps={{
                    step: isWeighted ? "0.001" : "1",
                    min: "0",
                    readOnly: isWeightReadOnly || isBowlReadOnly,
                  }}
                />
              </Grid>

              {/* Total Price */}
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Total Price"
                  name="totalPrice"
                  type="number"
                  value={formik.values.totalPrice.toFixed(2)}
                  variant="outlined"
                  InputProps={{
                    readOnly: true,
                  }}
                />
              </Grid>

              {/* Add Button */}
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  fullWidth
                  variant="contained"
                  color="primary"
                  onClick={addProductHandler}
                  disabled={!isFormValid}
                  sx={{ height: '56px' }}
                >
                  Add Product
                </Button>
              </Grid>
            </Grid>
          </form>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h5" gutterBottom>
            Order Items ({orderProps.orderItems.length})
          </Typography>
          <Box sx={{ maxHeight: 300, overflowY: 'auto', mb: 2 }}>
            {orderProps.orderItems.map((item, index) => (
              <Card key={index} variant="outlined" sx={{ mb: 1 }}>
                <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                  <Grid container alignItems="center" spacing={1}>
                    <Grid item xs={6}>
                      <Typography variant="body1" fontWeight="bold">
                        {item.altName || item.name}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {item.quantity} x {item.productPrice.toFixed(2)}
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body1" align="right">
                        ₹ {item.totalPrice.toFixed(2)}
                      </Typography>
                    </Grid>
                    <Grid item xs={2}>
                      <Button
                        color="error"
                        size="small"
                        onClick={() => removeProductHandler(index)}
                      >
                        <Delete fontSize="small" />
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Divider sx={{ my: 3 }} />

          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm={6} md={4}>
              <Typography variant="h6">Sub Total: ₹ {orderProps.subTotal.toFixed(2)}</Typography>
              <Typography variant="h6">Tax ({orderProps.taxPercent}%): ₹ {orderProps.tax.toFixed(2)}</Typography>
              <Typography variant="h5" color="primary">
                Grand Total: ₹ {orderProps.total.toFixed(2)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={8} sx={{ textAlign: 'right' }}>
              <Button
                variant="contained"
                color="success"
                onClick={saveOrderHandler}
                disabled={orderProps.orderItems.length === 0}
                sx={{ mr: 2, height: '56px' }}
              >
                Save Order
              </Button>
              <Button
                variant="outlined"
                color="info"
                onClick={resetForm}
                sx={{ height: '56px' }}
              >
                Clear Order
              </Button>
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm={6} md={4}>
              <Typography variant="h6">Today's Total: ₹ {todayGrandTotal.toFixed(2)}</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Select
                fullWidth
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                displayEmpty
                inputProps={{ 'aria-label': 'Without label' }}
              >
                <MenuItem value={1}>Template 1</MenuItem>
                <MenuItem value={2}>Template 2</MenuItem>
              </Select>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Button
                fullWidth
                variant="outlined"
                color="secondary"
                onClick={printPdf}
                disabled={!pdfUrl && !archivedPdfUrl}
                sx={{ height: '56px' }}
              >
                Print PDF
              </Button>
            </Grid>
          </Grid>

          {/* PDF Viewer */}
          <Box sx={{ mt: 3, border: '1px solid #ccc', height: 600 }}>
            <iframe
              ref={pdfRef}
              src={archivedPdfUrl || pdfUrl}
              title="Invoice PDF"
              width="100%"
              height="100%"
              style={{ border: 'none' }}
            />
          </Box>

          {/* High Value Modal (simple implementation) */}
          {showHighValueModal && (
            <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Card sx={{ p: 3, maxWidth: 400 }}>
                <Typography variant="h5" color="warning.main" gutterBottom>
                  High Value Product Alert
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  The last added product has a total price between ₹300 and ₹999.
                  Please confirm the price before proceeding.
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => setShowHighValueModal(false)}
                  sx={{ mr: 2 }}
                >
                  Confirm (Enter or =)
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    setShowHighValueModal(false);
                    removeProductHandler(orderProps.orderItems.length - 1);
                  }}
                >
                  Cancel (Esc)
                </Button>
              </Card>
            </Box>
          )}

        </CardContent>
      </Card>
    </Box>
  );
};
