
const mongoose = require("mongoose");
const DeliveryZone = require("../models/DeliveryZone");

// --------------------------------------------------
// LOCATION HELPERS
// --------------------------------------------------

const normalizeLocation = (value = "") =>
  String(value).trim().toLowerCase().replace(/\s+/g, " ");

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exactRegex = (value) =>
  new RegExp(`^${escapeRegex(String(value).trim())}$`, "i");

const cleanString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeCountryCode = (value = "NG") =>
  String(value).trim().toUpperCase();

// --------------------------------------------------
// VALIDATE CUSTOMER LOCATION
// --------------------------------------------------

const validateLocation = ({
  countryCode,
  country,
  region,
  state,
  city,
  area,
  postalCode,
}) => {
  const code = normalizeCountryCode(countryCode || "NG");

  if (!/^[A-Z]{2}$/.test(code)) {
    return "A valid two-letter country code is required.";
  }

  if (!city || typeof city !== "string" || !city.trim()) {
    return "City or settlement is required.";
  }

  if (country !== undefined && typeof country !== "string") {
    return "Country must be a valid text value.";
  }

  if (region !== undefined && typeof region !== "string") {
    return "Region must be a valid text value.";
  }

  if (state !== undefined && typeof state !== "string") {
    return "State must be a valid text value.";
  }

  if (area !== undefined && typeof area !== "string") {
    return "Area must be a valid text value.";
  }

  if (postalCode !== undefined && typeof postalCode !== "string") {
    return "Postal code must be a valid text value.";
  }

  return null;
};

// --------------------------------------------------
// DELIVERY ZONE MATCHING
// --------------------------------------------------

const findMatchingDeliveryZone = async ({
  countryCode = "NG",
  regionId = "",
  regionCode = "",
  cityId = "",
  country = "",
  region = "",
  state = "",
  city,
  area = "",
  postalCode = "",
}) => {
  const code = normalizeCountryCode(countryCode);

  const regionValue = normalizeLocation(region || state);
  const cityValue = normalizeLocation(city);
  const areaValue = normalizeLocation(area);
  const postalValue = normalizeLocation(postalCode);

  // Include older Nigerian records without countryCode.
  const countryQuery =
    code === "NG"
      ? {
          $or: [
            { countryCode: "NG" },
            { countryCode: { $exists: false } },
            { countryCode: null },
            { countryCode: "" },
          ],
        }
      : {
          countryCode: code,
        };

  const zones = await DeliveryZone.find({
    active: true,
    ...countryQuery,
  });

  // Only consider zones belonging to the selected country.
  const matchingZones = zones.filter((zone) => {
    const zoneCity = normalizeLocation(zone.city);

    if (zoneCity !== cityValue) {
      return false;
    }

    // Prefer geographic IDs whenever both sides have them.
    if (cityId && zone.cityId) {
      if (String(zone.cityId) !== String(cityId)) {
        return false;
      }
    }

    // Match region IDs when supplied.
    if (regionId && zone.regionId) {
      if (String(zone.regionId) !== String(regionId)) {
        return false;
      }
    }

    // Match region codes when both are available.
    if (regionCode && zone.regionCode) {
      if (
        normalizeLocation(zone.regionCode) !==
        normalizeLocation(regionCode)
      ) {
        return false;
      }
    }

    // Legacy state/region name matching.
    const zoneRegion = normalizeLocation(
      zone.region || zone.state
    );

    if (regionValue && zoneRegion && zoneRegion !== regionValue) {
      return false;
    }

    // When a region is provided, do not match a zone
    // assigned to a different region.
    if (regionValue && !zoneRegion && !zone.regionId) {
      return false;
    }

    return true;
  });

  // Prefer exact area or postcode restrictions.
  const restrictedZone = matchingZones.find((zone) => {
    const zoneAreas = (zone.areas || []).map(normalizeLocation);
    const zonePostalCodes = (zone.postalCodes || []).map(
      normalizeLocation
    );

    const areaMatches =
      areaValue && zoneAreas.includes(areaValue);

    const postalMatches =
      postalValue && zonePostalCodes.includes(postalValue);

    return Boolean(areaMatches || postalMatches);
  });

  if (restrictedZone) {
    return restrictedZone;
  }

  // A restricted zone must not be treated as city-wide.
  // Only zones without area or postcode restrictions cover
  // the entire city.
  return (
    matchingZones.find(
      (zone) =>
        (!zone.areas || zone.areas.length === 0) &&
        (!zone.postalCodes || zone.postalCodes.length === 0)
    ) || null
  );
};

// --------------------------------------------------
// CUSTOMER: GET DELIVERY ZONES
// GET /api/delivery/zones
// --------------------------------------------------

const getActiveDeliveryZones = async (req, res) => {
  try {
    const zones = await DeliveryZone.find({
      active: true,
    })
      .select(
        "name country countryCode state region regionCode regionId city cityId locationProvider areas postalCodes fee currency estimatedDelivery notes"
      )
      .sort({
        country: 1,
        region: 1,
        city: 1,
        name: 1,
      });

    return res.status(200).json({
      success: true,
      zones,
    });
  } catch (error) {
    console.error("GET DELIVERY ZONES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load delivery zones.",
    });
  }
};

// --------------------------------------------------
// CUSTOMER: CALCULATE DELIVERY QUOTE
// POST /api/delivery/quote
// --------------------------------------------------

const calculateDeliveryQuote = async (req, res) => {
  try {
    const {
      countryCode = "NG",
      country = "",
      region = "",
      state = "",
      regionId = "",
      regionCode = "",
      city,
      cityId = "",
      area = "",
      postalCode = "",
    } = req.body;

    const validationError = validateLocation({
      countryCode,
      country,
      region,
      state,
      city,
      area,
      postalCode,
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const zone = await findMatchingDeliveryZone({
      countryCode,
      country,
      region,
      state,
      regionId,
      regionCode,
      city,
      cityId,
      area,
      postalCode,
    });

    if (!zone) {
      return res.status(200).json({
        success: true,
        deliveryAvailable: false,
        requiresManualQuote: true,
        message:
          "Delivery is not yet available for this location. Please contact ABS CUT for a delivery quotation.",
      });
    }

    return res.status(200).json({
      success: true,
      deliveryAvailable: true,
      requiresManualQuote: false,
      quote: {
        zoneId: zone._id,
        zoneName: zone.name,
        country: zone.country || country || "Nigeria",
        countryCode: zone.countryCode || countryCode,
        state: zone.state || zone.region || state,
        region: zone.region || zone.state || region,
        regionId: zone.regionId || "",
        city: zone.city,
        cityId: zone.cityId || "",
        area: cleanString(area),
        postalCode: cleanString(postalCode),
        fee: zone.fee,
        currency: zone.currency || "NGN",
        estimatedDelivery: zone.estimatedDelivery,
      },
    });
  } catch (error) {
    console.error("DELIVERY QUOTE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to calculate delivery fee.",
    });
  }
};

// --------------------------------------------------
// ADMIN: GET ALL DELIVERY ZONES
// GET /api/delivery/admin/zones
// --------------------------------------------------

const getAdminDeliveryZones = async (req, res) => {
  try {
    const zones = await DeliveryZone.find()
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      zones,
    });
  } catch (error) {
    console.error("ADMIN DELIVERY ZONES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load delivery zones.",
    });
  }
};

// --------------------------------------------------
// VALIDATE ADMIN ZONE FIELDS
// --------------------------------------------------

const validateZoneData = ({
  name,
  country,
  countryCode,
  state,
  region,
  city,
  fee,
  currency,
  areas,
  postalCodes,
}) => {
  if (!name || !String(name).trim()) {
    return "Delivery zone name is required.";
  }

  if (!city || !String(city).trim()) {
    return "City or settlement is required.";
  }

  if (
    !country ||
    typeof country !== "string" ||
    !country.trim()
  ) {
    return "Country is required.";
  }

  if (
    !countryCode ||
    !/^[A-Z]{2}$/.test(normalizeCountryCode(countryCode))
  ) {
    return "A valid two-letter country code is required.";
  }

  if (
    !region &&
    !state
  ) {
    return "Region or state is required.";
  }

  if (
    fee === undefined ||
    fee === null ||
    fee === "" ||
    !Number.isFinite(Number(fee)) ||
    Number(fee) < 0
  ) {
    return "Delivery fee must be a valid non-negative number.";
  }

  if (
    currency &&
    !/^[A-Z]{3}$/.test(String(currency).trim().toUpperCase())
  ) {
    return "Currency must be a valid three-letter currency code.";
  }

  if (areas !== undefined && !Array.isArray(areas)) {
    return "Delivery areas must be an array.";
  }

  if (
    postalCodes !== undefined &&
    !Array.isArray(postalCodes)
  ) {
    return "Postal codes must be an array.";
  }

  return null;
};

// --------------------------------------------------
// CLEAN AND VALIDATE AREA / POSTCODE ARRAYS
// --------------------------------------------------

const cleanLocationArray = (values = []) => {
  if (!Array.isArray(values)) {
    return {
      error: "Location restrictions must be arrays.",
    };
  }

  const cleaned = values.map((value) =>
    typeof value === "string" ? value.trim() : ""
  );

  if (cleaned.some((value) => !value)) {
    return {
      error: "Location restrictions cannot contain empty values.",
    };
  }

  const normalized = cleaned.map(normalizeLocation);

  if (new Set(normalized).size !== normalized.length) {
    return {
      error: "Duplicate location restrictions are not allowed.",
    };
  }

  return { values: cleaned };
};

// --------------------------------------------------
// ADMIN: CREATE DELIVERY ZONE
// POST /api/delivery/admin/zones
// --------------------------------------------------

const createDeliveryZone = async (req, res) => {
  try {
    const {
      name,
      country = "Nigeria",
      countryCode = "NG",
      state = "",
      region = "",
      regionCode = "",
      regionId = "",
      city,
      cityId = "",
      locationProvider = "manual",
      areas = [],
      postalCodes = [],
      fee,
      currency = "NGN",
      estimatedDelivery = "",
      notes = "",
      active = true,
    } = req.body;

    const finalRegion = cleanString(region || state);

    const validationError = validateZoneData({
      name,
      country,
      countryCode,
      state: finalRegion,
      region: finalRegion,
      city,
      fee,
      currency,
      areas,
      postalCodes,
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const validProviders = ["manual", "placedb", "geonames"];

    if (!validProviders.includes(locationProvider)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location data provider.",
      });
    }

    const cleanedAreas = cleanLocationArray(areas);
    const cleanedPostalCodes = cleanLocationArray(postalCodes);

    if (cleanedAreas.error || cleanedPostalCodes.error) {
      return res.status(400).json({
        success: false,
        message:
          cleanedAreas.error || cleanedPostalCodes.error,
      });
    }

    const zone = await DeliveryZone.create({
      name: String(name).trim(),

      country: String(country).trim(),
      countryCode: normalizeCountryCode(countryCode),

      state: finalRegion,
      region: finalRegion,
      regionCode: cleanString(regionCode),
      regionId: cleanString(regionId),

      city: String(city).trim(),
      cityId: cleanString(cityId),

      locationProvider,

      areas: cleanedAreas.values,
      postalCodes: cleanedPostalCodes.values,

      fee: Number(fee),
      currency: String(currency).trim().toUpperCase(),

      estimatedDelivery: cleanString(estimatedDelivery),
      notes: cleanString(notes),

      active: active !== false,
    });

    return res.status(201).json({
      success: true,
      message: "Delivery zone created successfully.",
      zone,
    });
  } catch (error) {
    console.error("CREATE DELIVERY ZONE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create delivery zone.",
    });
  }
};

// --------------------------------------------------
// ADMIN: UPDATE DELIVERY ZONE
// PUT /api/delivery/admin/zones/:id
// --------------------------------------------------

const updateDeliveryZone = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery zone ID.",
      });
    }

    const allowedFields = [
      "name",
      "country",
      "countryCode",
      "state",
      "region",
      "regionCode",
      "regionId",
      "city",
      "cityId",
      "locationProvider",
      "areas",
      "postalCodes",
      "fee",
      "currency",
      "estimatedDelivery",
      "notes",
      "active",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          field
        )
      ) {
        updates[field] = req.body[field];
      }
    }

    // Keep legacy state and new region fields synchronized.
    if (updates.region !== undefined) {
      updates.region = cleanString(updates.region);
      updates.state = updates.region;
    } else if (updates.state !== undefined) {
      updates.state = cleanString(updates.state);
      updates.region = updates.state;
    }

    if (updates.country !== undefined) {
      if (
        typeof updates.country !== "string" ||
        !updates.country.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Country is required.",
        });
      }

      updates.country = updates.country.trim();
    }

    if (updates.countryCode !== undefined) {
      updates.countryCode = normalizeCountryCode(
        updates.countryCode
      );

      if (!/^[A-Z]{2}$/.test(updates.countryCode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid country code.",
        });
      }
    }

    if (updates.fee !== undefined) {
      if (
        updates.fee === "" ||
        !Number.isFinite(Number(updates.fee)) ||
        Number(updates.fee) < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Delivery fee must be a valid non-negative number.",
        });
      }

      updates.fee = Number(updates.fee);
    }

    if (updates.currency !== undefined) {
      updates.currency = String(updates.currency)
        .trim()
        .toUpperCase();

      if (!/^[A-Z]{3}$/.test(updates.currency)) {
        return res.status(400).json({
          success: false,
          message: "Invalid currency code.",
        });
      }
    }

    if (updates.locationProvider !== undefined) {
      if (
        !["manual", "placedb", "geonames"].includes(
          updates.locationProvider
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid location data provider.",
        });
      }
    }

    for (const field of [
      "name",
      "city",
      "regionCode",
      "regionId",
      "cityId",
      "estimatedDelivery",
      "notes",
    ]) {
      if (updates[field] !== undefined) {
        if (typeof updates[field] !== "string") {
          return res.status(400).json({
            success: false,
            message: `${field} must be a text value.`,
          });
        }

        updates[field] = updates[field].trim();
      }
    }

    if (updates.areas !== undefined) {
      const result = cleanLocationArray(updates.areas);

      if (result.error) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      updates.areas = result.values;
    }

    if (updates.postalCodes !== undefined) {
      const result = cleanLocationArray(updates.postalCodes);

      if (result.error) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }

      updates.postalCodes = result.values;
    }

    const zone = await DeliveryZone.findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Delivery zone not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery zone updated successfully.",
      zone,
    });
  } catch (error) {
    console.error("UPDATE DELIVERY ZONE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update delivery zone.",
    });
  }
};

// --------------------------------------------------
// ADMIN: DEACTIVATE DELIVERY ZONE
// DELETE /api/delivery/admin/zones/:id
// --------------------------------------------------

const deleteDeliveryZone = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery zone ID.",
      });
    }

    const zone = await DeliveryZone.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { new: true }
    );

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Delivery zone not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery zone deactivated successfully.",
    });
  } catch (error) {
    console.error("DELETE DELIVERY ZONE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to deactivate delivery zone.",
    });
  }
};

// --------------------------------------------------
// EXPORTS
// --------------------------------------------------

module.exports = {
  getActiveDeliveryZones,
  calculateDeliveryQuote,
  getAdminDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
};

