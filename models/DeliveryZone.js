
const mongoose = require("mongoose");

const deliveryZoneSchema = new mongoose.Schema(
  {
    // ABS CUT's own delivery-zone name.
    // Example: Nigeria - Lagos - Ikeja.
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Country information.
    country: {
      type: String,
      required: true,
      trim: true,
      default: "Nigeria",
    },

    // ISO 3166-1 alpha-2 country code.
    // Examples: NG, GB, CA, US, DE.
    countryCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "NG",
      minlength: 2,
      maxlength: 2,
    },

    // Legacy field retained for existing Nigerian zones.
    // Also accommodates the region/province/state name.
    state: {
      type: String,
      default: "",
      trim: true,
    },

    // General administrative division.
    // Examples: Lagos State, Ontario, England, Bavaria.
    region: {
      type: String,
      default: "",
      trim: true,
    },

    // Geographic identifiers supplied by the location provider.
    regionCode: {
      type: String,
      default: "",
      trim: true,
    },

    regionId: {
      type: String,
      default: "",
      trim: true,
    },

    // City, town, district or settlement.
    // Existing city values remain compatible.
    city: {
      type: String,
      required: true,
      trim: true,
    },

    cityId: {
      type: String,
      default: "",
      trim: true,
    },

    // Identifies where the geographic data came from.
    locationProvider: {
      type: String,
      enum: ["manual", "placedb", "geonames"],
      default: "manual",
    },

    // Empty areas means the zone covers the entire city.
    areas: {
      type: [String],
      default: [],
      validate: {
        validator: function (areas) {
          return (
            Array.isArray(areas) &&
            areas.every(
              (area) =>
                typeof area === "string" &&
                area.trim().length > 0
            )
          );
        },
        message: "Delivery areas must contain valid names.",
      },
    },

    // Optional postcode restrictions for the delivery zone.
    postalCodes: {
      type: [String],
      default: [],
      validate: {
        validator: function (codes) {
          return (
            Array.isArray(codes) &&
            codes.every(
              (code) =>
                typeof code === "string" &&
                code.trim().length > 0
            )
          );
        },
        message: "Postal codes must contain valid values.",
      },
    },

    // Delivery charge in the currency specified below.
    fee: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: "NGN",
    },

    estimatedDelivery: {
      type: String,
      default: "",
      trim: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Existing Nigerian zones remain searchable.
deliveryZoneSchema.index({
  state: 1,
  city: 1,
  active: 1,
});

// International location lookup.
deliveryZoneSchema.index({
  countryCode: 1,
  city: 1,
  active: 1,
});

// More precise geographic matching.
deliveryZoneSchema.index({
  countryCode: 1,
  regionId: 1,
  cityId: 1,
  active: 1,
});

module.exports = mongoose.model(
  "DeliveryZone",
  deliveryZoneSchema
);
