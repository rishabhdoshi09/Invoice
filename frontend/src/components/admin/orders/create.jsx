
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useFormik } from "formik";
import moment from "moment";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { fetchWeightsAction } from "../../../services/weighingScale";
import { createOrder } from "../../../services/order";
import { ProductType } from "../../../enums/product";
import { generatePdfDefinition } from "./templates/template1";
import { generatePdfDefinition2 } from "./templates/template2";
import { Autocomplete, TextField, Button, Grid, Paper, Typography, Box, Modal, IconButton, Chip } from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

const INVOICES_KEY = "localInvoices";
const getTodayStr = () => moment().format("DD-MM-YYYY");
const getTodayGrandTotal = () => {
  try {
    const all = JSON.parse(localStorage.getItem(INVOICES_KEY) || "[]");
    const today = getTodayStr();
    return all
      .filter((inv) => inv.orderDate === today)
      .reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);
  } catch {
    return 0;
  }
};

const isEditableTarget = (el) => {
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    el.contentEditable === "true"
  );
};

const toNumber = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

function persistInvoice(invoice) {
  const finalObj = { ...invoice, savedAt: new Date().toISOString() };
  try {
    const all = JSON.parse(localStorage.getItem(INVOICES_KEY) || "[]");
    all.push(finalObj);
    localStorage.setItem(INVOICES_KEY, JSON.stringify(all));
    try {
      window.dispatchEvent(new CustomEvent("INVOICES_UPDATED"));
    } catch {}
  } catch (e) {
    console.warn("Failed to persist invoice locally", e);
  }
  return finalObj;
}

function loadAllInvoices() {
  try {
    return JSON.parse(localStorage.getItem(INVOICES_KEY) || "[]");
  } catch {
    return [];
  }
}
function computeDailyTotalsFromInvoices(invoices) {
  const byDate = {};
  invoices.forEach((inv) => {
    const day =
      inv.orderDate && /^\d{2}-\d{2}-\d{4}$/.test(inv.orderDate)
        ? inv.orderDate
        : moment(inv.savedAt).isValid()
        ? moment(inv.savedAt).format("DD-MM-YYYY")
        : getTodayStr();
    if (!byDate[day]) byDate[day] = { date: day, total: 0, count: 0 };
    byDate[day].total += toNumber(inv.total);
    byDate[day].count += 1;
  });
  // sort desc by date
  return Object.values(byDate).sort((a, b) => {
    const ma = moment(a.date, "DD-MM-YYYY");
    const mb = moment(b.date, "DD-MM-YYYY");
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
    (state) => state?.productState?.products?.rows || {},
    (a, b) => {
      if (a === b) return true;
      if (!a || !b) return false;
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      return keysA.length === keysB.length && keysA.every((k) => a[k] === b[k]);
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

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        ...c,
        label: c?.name || c?.title || c?.mobile || "Customer",
      })),
    [customers]
  );

  const productOptions = useMemo(
    () =>
      Object.keys(rows || {})?.map((id) => ({
        label: (rows[id].name || "").toUpperCase(),
        productId: id,
        value: rows[id].name,
      })) || [],
    [rows]
  );

  const [pdfUrl, setPdfUrl] = useState("");
  const pdfRef = useRef(null);
  const firstDigitLockRef = useRef(null);
  const lastAddSucceededRef = useRef(false);

  const [selectedQuick, setSelectedQuick] = useState("");
  const clearQuickHighlight = () => setSelectedQuick("");
  const [highlightedQuickProduct, setHighlightedQuickProduct] = useState(null);
  const quickVariant = (tag) =>
    selectedQuick === tag || highlightedQuickProduct === tag
      ? "contained"
      : "outlined";

  const [template, setTemplate] = useState(1);
  const TEMPLATE_MAP = useMemo(() => ({ 1: 2, 2: 1 }), []);

  const [archivedOrderProps, setArchivedOrderProps] = useState(null);
  const [archivedPdfUrl, setArchivedPdfUrl] = useState("");

  const [lastSubmitError, setLastSubmitError] = useState(null);
  const [lastSubmitResponse, setLastSubmitResponse] = useState(null);
  const [lastInvoiceTotal, setLastInvoiceTotal] = useState(null);

  const [suppressAutoSuggest, setSuppressAutoSuggest] = useState(false);





  const [fetchedViaScale, setFetchedViaScale] = useState(false);

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
      if (frame && frame.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      }
      const w = window.open(archivedPdfUrl || pdfUrl);
      if (w) {
        const onLoad = () => {
          try {
            w.print();
          } catch {}
        };
        w.addEventListener("load", onLoad, { once: true });
      }
    } catch {}
  }, [pdfUrl, archivedPdfUrl]);

  const safeGetProductName = (rowsObj, item) => {
    const row = rowsObj && item ? rowsObj[item.productId] : undefined;
    return (row && row.name) || item?.name || "ITEM";
  };

  const generatePdf = useCallback(
    (pdfProps) => {
      const updatedProps = JSON.parse(JSON.stringify(pdfProps));
      updatedProps.orderItems =
        updatedProps.orderItems?.map((item) => ({
          name:
            item.altName && item.altName.trim()
              ? item.altName.trim()
              : safeGetProductName(rows, item),
          productPrice: item.productPrice,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
        })) ?? [];
      const chosen = TEMPLATE_MAP[template] ?? template;
      const pdfObject =
        chosen === 1
          ? generatePdfDefinition(updatedProps)
          : generatePdfDefinition2(updatedProps);
      pdfMake
        .createPdf(pdfObject)
        .getBlob((blob) => {
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        });
    },
    [rows, template, TEMPLATE_MAP]
  );

  const initialOrderProps = useMemo(
    () => ({
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
      total: 0,
    }),
    []
  );

  const [orderProps, setOrderProps] = useState(initialOrderProps);
  const [todayGrandTotal, setTodayGrandTotal] = useState(getTodayGrandTotal());

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [inputValue, setInputValue] = useState("");

  function formikSafeGet(field) {
    try {
      return (formik && formik.values && formik.values[field]) || "";
    } catch {
      return "";
    }
  }

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      id: "",
      type: "",
      name: "",
      altName: "",
      template: 1,
      productPrice: "",
      quantity: 0,
      totalPrice: 0,
    },
    onSubmit: async (values) => {
      lastAddSucceededRef.current = false;

      try {
        const currentIsBowl = Boolean(
          values &&
            (String(values.name || "").toLowerCase().includes("bowl"))
        );
        if (currentIsBowl) {
          const valStr = String(values.productPrice || "").replace(/\D/g, "");
          if (valStr.length !== 3) {
            alert("Bowl price must be exactly 3 digits (100–999).");
            return;
          }
          const numeric = Number(valStr);
          if (numeric < 100 || numeric > 999) {
            alert("Bowl price must be between 100 and 999.");
            return;
          }
          values.productPrice = valStr;
        }
      } catch {}

      if (Number(values.quantity) <= 0) {
        alert("Cannot add product with zero quantity. Please fetch a valid weight.");
        return;
      }

      const priceNumLocal = Number(values?.productPrice) || 0;

      // For weighted products: enforce 3-digit price (100-999)
      const isWeightedProduct = (values?.type === ProductType.WEIGHTED || String(values?.type||"").toLowerCase()==="weighted");
      if (isWeightedProduct) {
        const priceStr = String(priceNumLocal);
        if (priceStr.length !== 3 || priceNumLocal < 100 || priceNumLocal > 999) {
          alert("Weighted product price must be exactly 3 digits (100-999).");
          return;
        }
      } else {
        if (priceNumLocal <= 0) {
          alert("Product price must be greater than 0.");
          return;
        }
      }

      const price = Number(values?.productPrice) || 0;
      const qty = Number(values?.quantity) || 0;
      const lineTotal = Number((price * qty).toFixed(2));
      const subTotal = Number((orderProps.subTotal + lineTotal).toFixed(2));
      const tax = Number((subTotal * (orderProps.taxPercent / 100)).toFixed(2));
      const newItem = {
        subTotal,
        tax,
        total: subTotal + tax,
        orderItems: [
          ...orderProps.orderItems,
          {
            productId: values.id,
            name: values.name,
            quantity: Number(values.quantity) || 0,
            productPrice: priceNumLocal,
            totalPrice: Number(
              (
                ((Number(values.productPrice) || 0) *
                  (Number(values.quantity) || 0)).toFixed(2)
              )
            ),
            type: values.type,
            altName: (values.altName || "").trim(),
          },
        ],
      };

      setOrderProps((prevProps) => {
        const np = { ...prevProps, ...newItem };
        try {
          generatePdf(np);
        } catch {}
        if (
          highlightedQuickProduct &&
          values.name.toLowerCase().includes(highlightedQuickProduct)
        ) {
          setHighlightedQuickProduct(null);
          clearQuickHighlight();
        }
        return np;
      });

      lastAddSucceededRef.current = true;

      try {
        const added = Number((price * qty).toFixed(2));
        setLastInvoiceTotal(added);
      } catch {}

      formik.resetForm();
      setSelectedProduct(null);
      setInputValue("");
      try {
        setFetchedViaScale(false);
      } catch {}
      clearQuickHighlight();
    },
  });

  const isWeighted = (formik.values.type === ProductType.WEIGHTED || String(formik.values.type||"").toLowerCase()==="weighted");





  // Get price range for weighted products (e.g., 250 -> 200-299)
  const getPriceRange = (price) => {
    if (!isWeighted || !price) return "";
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
    formik.setFieldValue("quantity", weight);
    setFetchedViaScale(true);
    const price = Number(formik.values.productPrice) || 0;
    formik.setFieldValue("totalPrice", Number((price * weight).toFixed(2)));
    return true;
  }, [dispatch, formik]);

  const selectAndMaybeAdd = useCallback(
    (product) => {
      onProductSelect(null, product);
      formik.handleSubmit();
    },
    [onProductSelect, formik]
  );

  const onProductSelect = useCallback(
    async (e, value) => {
      const classifyQuickTag = (raw) => {
        if (!raw) return "";
        const n = String(raw)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const hasKadi = /\b(kadi|kdi)\b/.test(n);
        const hasTiff = /\b(tiffin|tffn)\b/.test(n);
        if (/\bbt\s*tiffin\b/.test(n) || (hasKadi && hasTiff))
          return "kadi tiffin";
        if (/\bthali\b/.test(n) && /\bdelhi\b/.test(n)) return "thali delhi";
        if (/\bdabba\b/.test(n)) return "dabba";
        return "";
      };

      if (
        selectedProduct &&
        value?.productId !== selectedProduct?.productId &&
        formik.values.name &&
        !orderProps.orderItems.some((item) => item.productId === formik.values.id)
      ) {
        const ok = window.confirm(
          "Are you sure you want to change product? You have not added the current selection."
        );
        if (!ok) return;
      }

      const rawName =
        (rows && value && value.productId && rows[value.productId]?.name)
          ? rows[value.productId].name
          : value?.label || value?.value || "";
      setSelectedQuick(classifyQuickTag(rawName));
      setSelectedProduct(value);

      if (value) {
        const { productId } = value;
        if (!rows || !productId || !rows[productId]) {
          formik.setFieldValue("id", productId ?? "");
          formik.setFieldValue("name", value?.value || "");
          formik.setFieldValue("type", "");
          formik.setFieldValue("productPrice", "");
          formik.setFieldValue("totalPrice", 0);

          setTimeout(() => clearQuickHighlight(), 100);
          return;
        }
        formik.setFieldValue("id", productId ?? "");
        formik.setFieldValue("name", rows[productId]?.name || "");
        formik.setFieldValue("type", rows[productId]?.type || "");
        const price = rows[productId]?.pricePerKg || 0;
        formik.setFieldValue("productPrice", price ? String(price) : "");
        try {
          firstDigitLockRef.current =
            (String(price || "") || "").charAt(0) || null;
        } catch {}
        formik.setFieldValue(
          "totalPrice",
          Number(((price || 0) * (Number(formik.values.quantity) || 0)).toFixed(2))
        );

        try {
          const productPrice = Number(price);
          // NEW: High-Value Product Lock (Price 300-399)
          const isHighValue = productPrice >= 300 && productPrice <= 399;

          if (isHighValue) {
            const alreadyAdded = orderProps.orderItems.some(
              (it) => String(it.productId) === String(productId)
            );
            if (!alreadyAdded) {
              setHighValueLock(true);
              setHighValueProductId(productId);
              // Also set priceLock for existing logic if price is exactly 300 (or any price in the range)
            }
          } else {
            setHighValueLock(false);
            setHighValueProductId(null);
          }
        } catch {}

        const selectedType = rows[productId]?.type;
        const looksWeighted =
          selectedType === ProductType.WEIGHTED ||
          String(selectedType || "").toLowerCase() === "weighted" ||
          rows[productId]?.weighted === true ||
          String(rows[productId]?.unitType || "").toLowerCase() === "weighted";

        try {
          const lab = (rows[productId]?.name || "").toLowerCase();
          if ((lab || "").includes("bowl")) {
            const bp = Number(rows[productId]?.pricePerKg) || 0;
            if (bp >= 100 && bp <= 399 && bp !== 200) {
              try {
                firstDigitLockRef.current = String(bp).charAt(0) || null;
              } catch {}
            } else {
            }
          } else {
          }
        } catch {}

        setFetchedViaScale(false);
        if (looksWeighted) {
          const success = await weighingScaleHandler();
          if (!success) {
            formik.resetForm();
            setSelectedProduct(null);
            setInputValue("");
            clearQuickHighlight();
            return;
          }
        }
        setTimeout(() => clearQuickHighlight(), 100);
      } else {
        formik.resetForm();
        setSelectedProduct(null);
        setInputValue("");
        try {
          setFetchedViaScale(false);
        } catch {}

        clearQuickHighlight();
      }
    },
    [selectedProduct, formik, rows, orderProps.orderItems, weighingScaleHandler]
  );

  const attemptProductChange = useCallback(
    async (value) => {
      const currentlySelected = selectedProduct;
      const currentNameFilled = !!formik.values.name;
      const currentNotAdded = !orderProps.orderItems.some(
        (item) => item.productId === formik.values.id
      );

      if (
        currentlySelected &&
        value &&
        value.productId !== currentlySelected.productId &&
        currentNameFilled &&
        currentNotAdded
      ) {
        const ok = window.confirm(
          "Are you sure you want to change product? You have not added the current selection."
        );
        if (!ok) return;
      }

      try {
        await onProductSelect(null, value);
      } catch {}
    },
    [
      highValueLock,
      highValueProductId,
      selectedProduct,
      formik.values.name,
      formik.values.id,
      orderProps.orderItems,
      onProductSelect,
    ]
  );

  const onPriceFocus = (e) => {
    if (isNameAdd) {
      firstDigitLockRef.current = null;
      return;
    }
    if (formik.values.name && formik.values.name.toLowerCase() === "add") {
      firstDigitLockRef.current = null;
      return;
    }
    const val = String(e.target.value ?? "");
    {
      try {
        firstDigitLockRef.current =
          String(val || "").charAt(0) || firstDigitLockRef.current;
      } catch {}
    }
  };

  const onPriceKeyDown = (e) => {
    const navKeys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Tab",
      "Home",
      "End",
    ];
    if (navKeys.includes(e.key)) return;

    if (false) {
      const allowed = ["Backspace", "Delete"];
      if (!/^\d$/.test(e.key) && !allowed.includes(e.key)) {
        e.preventDefault();
        return;
      }
    }

    if (isNameAdd) return;
    const isBackspace = e.key === "Backspace";
    const isDelete = e.key === "Delete";
    if (!isBackspace && !isDelete) return;
    const target = e.target;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    const deletingFirstChar =
      (isBackspace && start === 1 && end === 1) ||
      (isDelete && start === 0 && end === 0) ||
      (start === 0 && end > 0);
    if (deletingFirstChar) {
      if (false) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
    }
  };



  const onPriceChange = (e) => {
    const rawInput = String(e.target.value || "");
    const numericInput = Number(rawInput) || 0;

    // NEW: Prevent typing 200 for weighted products
    if (isWeighted && rawInput.length === 3 && numericInput === 200) {
      e.preventDefault && e.preventDefault();
      return;
    }
    if (false) {
      if (!isNameAdd) {
        if (!(formik.values.name && formik.values.name.toLowerCase() === "add")) {
          const lock = firstDigitLockRef.current;
          if (lock && rawInput && String(rawInput).charAt(0) !== lock) {
            e.preventDefault && e.preventDefault();
            return;
          }
        }
      }
    }
    const numeric = Number(String(rawInput).replace(/\D/g, "")) || 0;
    formik.setFieldValue("productPrice", numeric);
    formik.setFieldValue(
      "totalPrice",
      Number((numeric * (Number(formik.values.quantity) || 0)).toFixed(2))
    );
  };

  const onPriceBlur = () => {};
  const onPasteHandler = (e) => {
    try {
      const clip = (e.clipboardData || window.clipboardData).getData("text") || "";
      if (false) {
        const digits = String(clip).replace(/\D/g, "");
        if (digits.length !== String(clip).length) {
          e.preventDefault();
          return;
        }
        if (digits.length > 3) {
          e.preventDefault();
          return;
        }
        const locked = String(firstDigitLockRef.current || "");
        if (locked && digits.length > 0 && String(digits).charAt(0) !== locked) {
          e.preventDefault();
          return;
        }
      } else {
        if (!isNameAdd) {
          const lock = firstDigitLockRef.current;
          if (lock && clip && String(clip).charAt(0) !== lock) {
            e.preventDefault();
            return;
          }
        }
      }
    } catch {}
  };

  const onQuantityChange = (e) => {
    const selectedIsBowl = Boolean(
      selectedProduct &&
        ((selectedProduct.label || selectedProduct.value || "").toLowerCase().includes(
          "bowl"
        ) ||
          (rows &&
            selectedProduct.productId &&
            (rows[selectedProduct.productId]?.name || "").toLowerCase().includes(
              "bowl"
            )))
    );
    const isQuantityReadOnly = Boolean(
      isWeightReadOnly || (selectedIsBowl && fetchedViaScale)
    );
    if (isQuantityReadOnly) return;

    const raw = e.target.value;
    if (isWeightReadOnly) return;
    if (isWeighted) {
      const val = Number(raw) || 0;
      formik.setFieldValue("quantity", val);
      const price = Number(formik.values.productPrice) || 0;
      formik.setFieldValue("totalPrice", Number((price * val).toFixed(2)));
    } else {
      formik.setFieldValue("quantity", raw);
      const price = Number(formik.values.productPrice) || 0;
      const numericQty = Number(raw) || 0;
      formik.setFieldValue("totalPrice", Number((price * numericQty).toFixed(2)));
    }
  };

  const addProductHandler = useCallback(async () => {
    try {
      if (archivedOrderProps || archivedPdfUrl) {
        setArchivedOrderProps(null);
        setArchivedPdfUrl("");
      }

      lastAddSucceededRef.current = false;

      if (isWeighted) {
        const success = await weighingScaleHandler();
        if (!success) {
          alert("Failed to fetch weight. Product not added.");
          return;
        }
        await formik.submitForm();
      } else {
        await formik.submitForm();
      }

      await new Promise((r) => setTimeout(r, 40));

      if (!lastAddSucceededRef.current) {
        alert("Add failed — product was not added. Please try again.");
        return;
      }
    } catch (err) {
      console.error("Add product handler failed", err);
      alert("Add failed due to an unexpected error. See console.");
    }
  }, [
    isHighValueLocked,
    isWeighted,
    weighingScaleHandler,
    formik,
    archivedOrderProps,
    archivedPdfUrl,
  ]);

  let fetchWeightLatestRef = useRef(null);
  useEffect(() => {
    fetchWeightLatestRef.current = weighingScaleHandler;
  });

  useEffect(() => {
    const onKeyDown = (e) => {
      const key = (e.key || "").toLowerCase();
      const code = e.code || "";
      if (key === "/" || code === "Slash") {
        e.preventDefault();
        try {
          fetchWeightLatestRef.current && fetchWeightLatestRef.current();
        } catch {}
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "1" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (isEditableTarget(t) || isEditableTarget(document.activeElement))
        return;
      e.preventDefault();
      const product = productOptions.find((p) =>
        p.label.toLowerCase().includes("dabba")
      );
      if (product) {
        selectAndMaybeAdd(product);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [productOptions, selectAndMaybeAdd]);

  useEffect(() => {
    generatePdf(orderProps);
  }, [template, generatePdf, orderProps]);

  const removeItem = useCallback(
    (index) => {
      if (window.confirm("Are you sure, you want to delete ?")) {
        setOrderProps((prev) => {
          const item = prev.orderItems[index];
          if (!item) return prev;
          const subTotal = Number((prev.subTotal - (item?.totalPrice || 0)).toFixed(2));
          const tax = Number((subTotal * (prev.taxPercent / 100)).toFixed(2));
          const updatedItems = prev.orderItems.filter((_, i) => i !== index);
          const np = {
            ...prev,
            orderItems: updatedItems,
            subTotal,
            tax,
            total: subTotal + tax,
          };
          try {
            generatePdf(np);
          } catch {}
          return np;
        });
      }
    },
    [generatePdf]
  );

  const resetOrder = useCallback(() => {
    if (window.confirm("Are you sure, you want to reset order ?")) {
      setOrderProps(initialOrderProps);
      setPdfUrl("");
      setLastSubmitError(null);
      setLastSubmitResponse(null);
      setLastInvoiceTotal(null);
      setArchivedOrderProps(null);
      setArchivedPdfUrl("");
      formik.resetForm();
      setSelectedProduct(null);
      setInputValue("");
      setHighValueLock(false);
      setHighValueProductId(null);
      setFetchedViaScale(false);
      clearQuickHighlight();
    }
  }, [initialOrderProps, formik, generatePdf]);

  const submitOrder = useCallback(async () => {
    if (!orderProps.customerName) {
      alert("Please select a customer.");
      return;
    }
    if (orderProps.orderItems.length === 0) {
      alert("Please add at least one item to the order.");
      return;
    }
    setLastSubmitError(null);
    setLastSubmitResponse(null);
    try {
      const response = await dispatch(createOrder(orderProps));
      if (response.error) {
        setLastSubmitError(response.error);
        alert(`Failed to submit order: ${response.error.message}`);
      } else {
        setLastSubmitResponse(response);
        alert("Order submitted successfully!");
        const newGrandTotal = getTodayGrandTotal() + (orderProps.total || 0);
        setTodayGrandTotal(newGrandTotal);
        persistInvoice(orderProps);
        refreshHistory();
        resetOrder();
      }
    } catch (err) {
      setLastSubmitError(err);
      alert(`Failed to submit order: ${err.message}`);
    }
  }, [dispatch, orderProps, resetOrder, refreshHistory]);


      } catch {}

      const { weight } = await dispatch(fetchWeightsAction());
      if (weight != null && Number(weight) > 0) {
        const name = rows[product.productId]?.name || product.value || "";
        if (archivedOrderProps || archivedPdfUrl) {
          setArchivedOrderProps(null);
          setArchivedPdfUrl("");
        }
        formik.setFieldValue("id", product.productId);
        formik.setFieldValue("name", name);
        formik.setFieldValue("quantity", weight);
        setFetchedViaScale(true);
        const price = Number(formik.values.productPrice) || 0;
        formik.setFieldValue("totalPrice", Number((price * weight).toFixed(2)));
        setTimeout(() => formik.handleSubmit(), 100);
        clearQuickHighlight();
      } else {
        alert("Weight fetched is zero or invalid. Please ensure the scale is ready.");
        clearQuickHighlight();
      }
    },
    [
      dispatch,
      formik,
      rows,
      orderProps.orderItems,
      attemptProductChange,
      archivedOrderProps,
      archivedPdfUrl,
    ]
  );

  const onCustomerChange = (e, value) => {
    if (value) {
      setOrderProps((prev) => ({
        ...prev,
        customerName: value.name,
        customerMobile: value.mobile,
        customer: value,
      }));
    } else {
      setOrderProps((prev) => ({
        ...prev,
        customerName: "",
        customerMobile: "",
        customer: null,
      }));
    }
  };

  const onNotesChange = (e) => {
    const { value } = e.target;
    setOrderProps((prev) => ({ ...prev, notes: value }));
  };

  const onTaxChange = (e) => {
    const taxPercent = Number(e.target.value) || 0;
    setOrderProps((prev) => {
      const subTotal = prev.subTotal;
      const tax = Number((subTotal * (taxPercent / 100)).toFixed(2));
      return { ...prev, taxPercent, tax, total: subTotal + tax };
    });
  };

  const onDateChange = (e) => {
    const { value } = e.target;
    setOrderProps((prev) => ({ ...prev, orderDate: value }));
  };

  const onTemplateChange = () => {
    setTemplate(TEMPLATE_MAP[template] ?? 1);
  };

  const onArchiveSelect = (invoice) => {
    setArchivedOrderProps(invoice);
    const chosen = TEMPLATE_MAP[template] ?? template;
    const pdfObject =
      chosen === 1
        ? generatePdfDefinition(invoice)
        : generatePdfDefinition2(invoice);
    pdfMake.createPdf(pdfObject).getBlob((blob) => {
      const url = URL.createObjectURL(blob);
      setArchivedPdfUrl(url);
    });
  };

  useEffect(() => {
    refreshHistory();
    const onInvoicesUpdated = () => refreshHistory();
    window.addEventListener("INVOICES_UPDATED", onInvoicesUpdated);
    return () => window.removeEventListener("INVOICES_UPDATED", onInvoicesUpdated);
  }, [refreshHistory]);

  return (
    <>
      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Create Invoice
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Autocomplete
                  options={customerOptions}
                  getOptionLabel={(option) => option.label || ""}
                  onChange={onCustomerChange}
                  renderInput={(params) => (
                    <TextField {...params} label="Customer" />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes"
                  value={orderProps.notes}
                  onChange={onNotesChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Tax (%)"
                  type="number"
                  value={orderProps.taxPercent}
                  onChange={onTaxChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Date"
                  value={orderProps.orderDate}
                  onChange={onDateChange}
                />
              </Grid>
              <Grid item xs={12}>
                <Autocomplete
                  freeSolo
                  options={productOptions}
                  inputValue={inputValue}
                  onInputChange={(e, newValue) => setInputValue(newValue)}
                    onChange={onProductSelect}
                  renderInput={(params) => (
                    <TextField {...params} label="Product" />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Alt. Name"
                  value={formik.values.altName}
                  onChange={(e) =>
                    formik.setFieldValue("altName", e.target.value)
                  }
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  label="Price"
                  value={formik.values.productPrice}
                  onChange={onPriceChange}
                  onKeyDown={onPriceKeyDown}
                    onFocus={onPriceFocus}
                  onBlur={onPriceBlur}
                  onPaste={onPasteHandler}
                  error={isWeightedPriceInvalid}
                  helperText={isWeightedPriceInvalid ? priceRange : ""}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  label="Quantity"
                  value={formik.values.quantity}
                  onChange={onQuantityChange}
                  InputProps={{
                    readOnly: isWeightReadOnly,
                  }}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  label="Total"
                  value={formik.values.totalPrice}
                  InputProps={{
                    readOnly: true,
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={addProductHandler}
                  disabled={!formik.values.id || !formik.values.name}
                >
                  Add Product
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" gutterBottom>
              Preview
            </Typography>
            <Box sx={{ height: "calc(100vh - 200px)" }}>
              <iframe
                ref={pdfRef}
                src={archivedPdfUrl || pdfUrl}
                title="Invoice Preview"
                width="100%"
                height="100%"
                style={{ border: "none" }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* High-Value Product Modal */}
      <Modal
        open={highValueLock}
        onClose={() => {}}
        aria-labelledby="high-value-product-modal-title"
        aria-describedby="high-value-product-modal-description"
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 400,
            bgcolor: "background.paper",
            border: "2px solid #000",
            boxShadow: 24,
            p: 4,
          }}
        >
          <Typography id="high-value-product-modal-title" variant="h6" component="h2">
            High-Value Product
          </Typography>
          <Typography id="high-value-product-modal-description" sx={{ mt: 2 }}>
            This product has a price of 300 or more. You can edit the price
            between 300 and 3           </Typography>
          <TextFieldld          fullWidth
            label="Confirm Price"
            name="productPrice"
            value={formik.values.productPrice}
            onChange={onPriceChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "=") {
                e.prev            onClick={() => {
              const numeric = Number(formik.values.productPrice);
              if (numeric >= 300 && numeric <= 999) {
                setHighValueLock(false);
                addProductHandler();
              } else {
                alert("Price must be between 300 and 999.");
              }
            }}
            }}
            sx={{ mt: 2 }}
          />tton
            onClick={() => {
              const numeric = Number(formik.values.productPrice) || 0;
              if (numeric >= 300 && numeric <= 399) {
                setHighValueLock(false);
                setHighValueProductId(null);
                addProductHandler();
              } else {
                alert("Price must be between 300 and 399.");
              }
            }}
            sx={{ mt: 2 }}
          >
            Confirm Price and Add Product
          </Button>
        </Box>
      </Modal>
    </>
  );
};

export default CreateOrder;
