import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";   //1 2
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as DocumentPicker from "expo-document-picker";
import { useContext } from "react";
import { BookingContext } from "@/src/context/BookingContext";
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native";
import { useEffect, useRef, useState, useCallback } from "react";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { TenantContext } from "@/src/context/TenantContext";
import AsyncStorage from '@react-native-async-storage/async-storage';
import BASE_URL, { fetchWithAuth } from "@/src/config/Api";
import { LinearGradient } from "expo-linear-gradient";

import {
  Animated,
  ImageBackground,
  BackHandler,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ImageViewer from "react-native-image-zoom-viewer";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import axios from "axios";
import COLORS from "../../theme/colors";
// let MapView = null;
// let Marker = null;
// let PROVIDER_GOOGLE = null;

// if (Platform.OS !== "web") {
//   const maps = require("react-native-maps");
//   MapView = maps.default;
//   Marker = maps.Marker;
//   PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
// }

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

// Map of canonical city name → list of all accepted aliases/typos
const CITY_ALIASES = {
  hyderabad: [
    "hyderabad", "hyderabd", "hyderad", "hydrabad", "hydarabad",
    "hyderbaad", "hiderabad", "hyd"
  ],
  bengaluru: [
    "bengaluru", "bangalore", "banglore", "banglor", "benglor",
    "bangalor", "bengalore", "blr"
  ],
  mumbai: ["mumbai", "bombay", "mumbai", "mumbay", "bomby", "bom"],
  delhi: ["delhi", "new delhi", "newdelhi", "nd", "dilli"],
  chennai: ["chennai", "madras", "chenai", "madras"],
  kolkata: ["kolkata", "calcutta", "kolkatta", "kolkota", "cal"],
  pune: ["pune", "poona", "puna"],
  ahmedabad: ["ahmedabad", "ahemdabad", "ahmadabad", "amdavad"],
  jaipur: ["jaipur", "jaipure", "jaypur"],
  surat: ["surat"],
  lucknow: ["lucknow", "lko"],
  kanpur: ["kanpur", "cawnpore"],
  nagpur: ["nagpur", "nagpure"],
  visakhapatnam: ["visakhapatnam", "vizag", "vishakhapatnam", "visakhapatanam"],
  bhopal: ["bhopal"],
  indore: ["indore"],
  patna: ["patna"],
  vadodara: ["vadodara", "baroda"],
  coimbatore: ["coimbatore", "coimbatur", "covai"],
  kochi: ["kochi", "cochin", "ernakulam"],
  thiruvananthapuram: ["thiruvananthapuram", "trivandrum", "tvm"],
  guwahati: ["guwahati", "gauhati"],
  chandigarh: ["chandigarh", "chd"],
  bhubaneswar: ["bhubaneswar", "bhubaneshwar", "bbsr"],
  dehradun: ["dehradun", "ddn"],
  noida: ["noida"],
  gurugram: ["gurugram", "gurgaon", "grg"],
  faridabad: ["faridabad"],
  agra: ["agra"],
  varanasi: ["varanasi", "banaras", "benares", "kashi"],
  mysuru: ["mysuru", "mysore"],
  mangaluru: ["mangaluru", "mangalore"],
  hubli: ["hubli", "hubballi"],
  belagavi: ["belagavi", "belgaum"],
  vijayawada: ["vijayawada", "vijayavada", "bezawada"],
  tirupati: ["tirupati", "tirupathi"],
  warangal: ["warangal"],
  nellore: ["nellore"],
  guntur: ["guntur"],
  rajahmundry: ["rajahmundry", "rajamahendravaram"],
};

// Neighborhood → canonical city mapping
const NEIGHBORHOOD_CITY_MAP = {
  // Hyderabad
  "durgam charuvu": "hyderabad", "durgam cheruvu": "hyderabad",
  "hitec city": "hyderabad", "hitech city": "hyderabad",
  "madhapur": "hyderabad", "gachibowli": "hyderabad",
  "kondapur": "hyderabad", "kukatpally": "hyderabad",
  "secunderabad": "hyderabad", "jubilee hills": "hyderabad",
  "banjara hills": "hyderabad", "ameerpet": "hyderabad",
  "charminar": "hyderabad", "miyapur": "hyderabad",
  "begumpet": "hyderabad", "dilshuknagar": "hyderabad",
  "lb nagar": "hyderabad", "uppal": "hyderabad",
  "kphb": "hyderabad", "nallagandla": "hyderabad",
  "narsingi": "hyderabad", "manikonda": "hyderabad",
  // Bangalore
  "whitefield": "bengaluru", "marathahalli": "bengaluru",
  "indiranagar": "bengaluru", "koramangala": "bengaluru",
  "jayanagar": "bengaluru", "electronic city": "bengaluru",
  "hebbal": "bengaluru", "byatarayanapura": "bengaluru",
  "yelahanka": "bengaluru", "banashankari": "bengaluru",
  "jp nagar": "bengaluru", "hsr layout": "bengaluru",
  "sarjapur": "bengaluru", "bellandur": "bengaluru",
  "btm layout": "bengaluru", "rajajinagar": "bengaluru",
  "malleshwaram": "bengaluru", "sadashivanagar": "bengaluru",
  // Mumbai
  "andheri": "mumbai", "bandra": "mumbai", "dadar": "mumbai",
  "borivali": "mumbai", "thane": "mumbai", "navi mumbai": "mumbai",
  "kurla": "mumbai", "juhu": "mumbai", "powai": "mumbai",
  // Delhi / NCR
  "connaught place": "delhi", "lajpat nagar": "delhi",
  "rohini": "delhi", "dwarka": "delhi", "saket": "delhi",
  "hauz khas": "delhi",
  // Chennai
  "t nagar": "chennai", "adyar": "chennai", "anna nagar": "chennai",
  "velachery": "chennai", "porur": "chennai", "omr": "chennai",
  // Pune
  "hinjewadi": "pune", "baner": "pune", "kothrud": "pune",
  "hadapsar": "pune", "wakad": "pune", "viman nagar": "pune",
};

const normalizeSearchText = (text, isSearchableText = false) => {
  if (!text) return "";
  let t = text.toLowerCase();

  // Step 1: Normalize all city aliases → canonical city name
  for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
    for (const alias of aliases) {
      if (t.includes(alias)) {
        t = t.split(alias).join(canonical);
      }
    }
  }

  // Step 2: For address/property text, enrich with city name if only neighborhood is present
  if (isSearchableText) {
    for (const [neighborhood, city] of Object.entries(NEIGHBORHOOD_CITY_MAP)) {
      if (t.includes(neighborhood) && !t.includes(city)) {
        t += " " + city;
      }
    }
  }

  return t;
};


const categories = [
  { id: "1", name: "All", icon: "grid-outline" },
  { id: "2", name: "Hostel", icon: "bed-outline" },
  { id: "3", name: "Apartment", icon: "business-outline" },
  { id: "4", name: "Commercial", icon: "briefcase-outline" },
];

export default function TenantHomeScreen({ route }) {

  // FILTER STATES
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [selectedHostelType, setSelectedHostelType] = useState("");
  const [selectedTenantType, setSelectedTenantType] = useState("");
  const [allProperties, setAllProperties] = useState([]);
  const [selectedCommercialFeature, setSelectedCommercialFeature] =
    useState("");

  const [nearMe, setNearMe] = useState(0);
  const [userCoords, setUserCoords] = useState(null);
  const [loading, setLoading] = useState(false);

  const [selectedProperty, setSelectedProperty] = useState(null);
  const bookingContext = useContext(BookingContext);

  const requests = bookingContext?.requests || [];
  const { tenantEmail, setTenantEmail } = useContext(TenantContext);
  const { setRequests, refreshTrigger } = useContext(BookingContext);
  const navigation = useNavigation();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Rehydrate TenantEmail if empty (e.g. after refresh or app restart)
  useEffect(() => {
    const checkEmail = async () => {
      if (!tenantEmail) {
        const stored = await AsyncStorage.getItem("tenantEmail");
        if (stored) {
          console.log("Rehydrating TenantContext with:", stored);
          setTenantEmail(stored);
        }
      }
    };
    checkEmail();
  }, []);

  const newNotifications = requests.filter(
    r =>
      (r.status?.toLowerCase() === "accepted" || r.status?.toLowerCase() === "rejected") &&
      !r.seen
  ).length;


  const fetchTenantRequests = async () => {
    try {
      const tenantPhone = await AsyncStorage.getItem("tenantPhone");
      console.log("Fetching tenant notifications for phone:", tenantPhone);
      if (!tenantPhone) {
        console.warn("No tenantPhone stored in AsyncStorage");
        return;
      }

      const res = await fetchWithAuth(`${BASE_URL}/api/tenant_notifications/${encodeURIComponent(tenantPhone)}/`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) {
        console.error(`Failed to fetch tenant notifications: ${res.status} ${res.statusText}`);
        return;
      }

      const data = await res.json();

      const formatted = data.map((item) => ({
        ...item,
        ownerPhone: item.owner_phone,
      }));

      setRequests(formatted);
    } catch (error) {
      console.log("Error fetching tenant notifications", error);
    }
  };

  useEffect(() => {
    fetchTenantRequests();
  }, [tenantEmail, refreshTrigger]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTenantRequests();
    }, 5000);

    return () => clearInterval(interval);
  }, [tenantEmail]);

  // Animation logic for pulsating notification
  useEffect(() => {
    if (newNotifications > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [newNotifications]);

  const fetchProperties = async () => {
    try {

      setLoading(true);

      console.log("Fetching properties...");

      const response = await fetchWithAuth(`${BASE_URL}/api/owner_props/`);
      const result = await response.json();

      console.log("API RESPONSE:", result);

      const MEDIA_URL = `${BASE_URL}/media/`;

      const formattedData = result.data.map((item) => {
        let mainImage = item.image
          ? item.image.startsWith("http")
            ? item.image
            : MEDIA_URL + item.image
          : null;

        let galleryImages = item.gallery
          ? item.gallery.map((img) =>
            img.startsWith("http") ? img : MEDIA_URL + img
          )
          : [];

        if (!mainImage && galleryImages.length > 0) {
          mainImage = galleryImages[0];
        }

        return {
          id: String(item.id),
          type: item.type || "Property",

          hostelType: item.hostelType || "N/A",
          allowedTenants: item.allowedTenants || "Anyone",

          name: item.name || "Unnamed Property",
          address: item.address || "No Address",
          contact: item.contact || "No Contact",

          ownerPhone: item.owner_phone,
          owner_id: item.owner_id,

          latitude: item.latitude ? parseFloat(item.latitude) : null,
          longitude: item.longitude ? parseFloat(item.longitude) : null,

          image: mainImage || "https://via.placeholder.com/400",

          isAvailable: item.isAvailable ?? true,
          ownerName: item.owner_name || "Owner",

          facilities: item.facilities || [],
          galleryImages: galleryImages,

          commercialType: item.commercialType || "",
          officeType: item.officeType || "",
          rent: item.rent || "",
        };
      });

      // AUTO GEOCODE MISSING LOCATIONS
      const geocodedData = await Promise.all(
        formattedData.map(async (p) => {

          if (!p.latitude || !p.longitude) {
            try {

              console.log("Geocoding:", p.name);

              const geo = await Location.geocodeAsync(p.address);

              if (geo.length > 0) {
                return {
                  ...p,
                  latitude: geo[0].latitude,
                  longitude: geo[0].longitude,
                };
              }

            } catch (e) {
              console.log("Geocode Error:", e);
            }
          }

          return p;
        })
      );

      console.log("FINAL PROPERTIES:", geocodedData);

      setAllProperties(geocodedData);
    } catch (error) {
      console.log("Fetch Properties Error:", error);
    }
    finally {

      setLoading(false);

    }
  };


  const [locationName, setLocationName] = useState("Fetching location...");
  const [isModalVisible, setModalVisible] = useState(false);
  const [mainSearch, setMainSearch] = useState("");
  const [selectedType, setSelectedType] = useState("All");




  const handlePress = (item) => {
    navigation.navigate("PropertyDetailsScreen", { property: item });
  };

  useFocusEffect(
    useCallback(() => {
      getLocation();
      fetchProperties();
      fetchTenantRequests();
    }, [tenantEmail])
  );

  useEffect(() => {
    fetchProperties();
  }, [
    mainSearch,
    selectedType,
    nearMe,
    selectedFacilities,
    selectedHostelType,
    selectedTenantType,
    selectedCommercialFeature,
    userCoords
  ]);

  useEffect(() => {
    if (route?.params?.property) {
      navigation.navigate("PropertyDetailsScreen", { property: route.params.property });
      navigation.setParams({ property: undefined });
    } else if (route?.params?.propertyName) {
      const prop = allProperties.find(p => p.name === route.params.propertyName);
      if (prop) {
        navigation.navigate("PropertyDetailsScreen", { property: prop });
        navigation.setParams({ propertyName: undefined });
      }
    }
  }, [route?.params?.property, route?.params?.propertyName, allProperties]);

  // NEW: One-time Welcome Screen check for newly accepted tenants
  useEffect(() => {
    const checkWelcome = async () => {
      const acceptedReq = requests.find(r => r.status?.toLowerCase() === "accepted" && r.status?.toLowerCase() !== "withdrawn");
      if (acceptedReq) {
        const welcomeSeen = await AsyncStorage.getItem("welcomeSeen");
        if (welcomeSeen !== "true") {
          navigation.replace("WelcomeScreen", {
            propertyName: acceptedReq.propertyName || acceptedReq.property_name,
          });
        }
      }
    };
    if (requests.length > 0) {
      checkWelcome();
    }
  }, [requests]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchTenantRequests();
    }, 5000);

    return () => clearInterval(interval);
  }, [tenantEmail]);

  useEffect(() => {
    const backAction = () => {
      if (selectedProperty) {
        setSelectedProperty(null); // go back to property list
        return true; // prevent default back action
      }
      return false; // allow normal back
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction,
    );

    return () => backHandler.remove();
  }, [selectedProperty]);

  const getLocation = async () => {
    try {
      setLocationName("Fetching location...");
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationName("Location permission denied");
        return;
      }

      let currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = currentLocation.coords;

      // 1. Update Coords for the distance formula
      setUserCoords({ latitude, longitude });

      // 2. Clear manual search text so it doesn't conflict with local results
      setMainSearch("");

      let addressResponse = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (addressResponse.length > 0) {
        const addr = addressResponse[0];
        setLocationName(`${addr.district || addr.name}, ${addr.city}`);
      }
    } catch (error) {
      console.log(error);
      setLocationName("Unable to fetch location");
    }
  };



  const getDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // KM

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Filtering Logic
  // Updated Filtering Logic
  const filteredProperties = allProperties.filter((item) => {

    const searchText = normalizeSearchText(mainSearch.trim(), false);

    const searchableText = normalizeSearchText(`
  ${item.name || ""}
  ${item.address || ""}
  ${item.type || ""}
  ${item.hostelType || ""}
  ${item.allowedTenants || ""}
  ${item.commercialType || ""}
  ${item.officeType || ""}
  ${(item.facilities || []).join(" ")}
`, true)
      .replace(/,/g, " ")
      .replace(/\s+/g, " ");

    const matchesSearch =
      searchText === "" ||
      searchableText.includes(searchText);

    // 2. Category
    const matchesType =
      selectedType === "All" ||
      item.type === selectedType;

    // 3. Distance
    let matchesDistance = true;


    if (nearMe > 0 && userCoords) {
      if (!item.latitude || !item.longitude) {
        return false;
      }
      const distance = getDistance(
        userCoords.latitude,
        userCoords.longitude,
        item.latitude,
        item.longitude
      );

      matchesDistance = distance <= nearMe;
    } else if (nearMe > 0 && !userCoords) {
      matchesDistance = false;
    }



    // 5. Facilities
    const matchesFacilities =
      selectedFacilities.length === 0 ||
      selectedFacilities.every((f) =>
        item.facilities?.includes(f)
      );

    // 6. Sub Filters
    let matchesSpecial = true;

    if (
      selectedHostelType &&
      item.type === "Hostel"
    ) {
      matchesSpecial =
        (item.hostelType || "")
          .toLowerCase() ===
        selectedHostelType.toLowerCase();
    }

    if (
      selectedTenantType &&
      item.type === "Apartment"
    ) {

      const tenantValue =
        (item.allowedTenants || "")
          .toLowerCase()
          .trim();

      matchesSpecial =
        tenantValue ===
        selectedTenantType.toLowerCase();

    }
    if (
      selectedCommercialFeature &&
      item.type === "Commercial"
    ) {

      const commercialValue =
        (
          item.commercialType ||
          item.officeType ||
          ""
        ).toLowerCase().trim();

      matchesSpecial =
        commercialValue ===
        selectedCommercialFeature.toLowerCase();

    }

    return (
      matchesSearch &&
      matchesType &&
      matchesDistance &&

      matchesFacilities &&
      matchesSpecial &&
      item.isAvailable
    );

  }).sort((a, b) => {
    const normalize = (str) => (str || "").replace(/\s+/g, '').toLowerCase();

    // 1. PRIORITY: ACCEPTED PROPERTIES
    const latestA = requests.find(r =>
      normalize(r.propertyName || r.property_name) === normalize(a.name)
    );
    const isAcceptedA = latestA?.status?.toLowerCase() === "accepted" || latestA?.status?.toLowerCase() === "completed";

    const latestB = requests.find(r =>
      normalize(r.propertyName || r.property_name) === normalize(b.name)
    );
    const isAcceptedB = latestB?.status?.toLowerCase() === "accepted" || latestB?.status?.toLowerCase() === "completed";

    if (isAcceptedA && !isAcceptedB) return -1;
    if (!isAcceptedA && isAcceptedB) return 1;

    // 2. SECONDARY: NEARBY PROPERTIES (DISTANCE)
    if (userCoords) {
      if (!a.latitude || !a.longitude) return 1;
      if (!b.latitude || !b.longitude) return -1;
      const distA = getDistance(userCoords.latitude, userCoords.longitude, a.latitude, a.longitude);
      const distB = getDistance(userCoords.latitude, userCoords.longitude, b.latitude, b.longitude);
      return distA - distB;
    }

    return 0;
  });
  const handleSelectType = (type) => {

    if (selectedType === type) {
      setSelectedType("All");
    } else {
      setSelectedType(type);
    }

    setSelectedHostelType("");
    setSelectedTenantType("");
    setSelectedCommercialFeature("");
  };

  const resetAllFilters = () => {
    setSelectedFacilities([]);
    setSelectedHostelType("");
    setSelectedTenantType("");
    setSelectedCommercialFeature("");

    setNearMe(0);
    setSelectedType("All");
    setMainSearch("");
  };
  const activeFilterCount = [
    nearMe > 0,

    selectedType !== "All",
    selectedHostelType !== "",
    selectedTenantType !== "",
    selectedCommercialFeature !== "",
    selectedFacilities.length > 0,
  ].filter(Boolean).length;


  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={homeStyles.container}
        edges={["left", "right", "bottom"]}
      >
        {/* Header */}
        {/* HERO SECTION */}








        <ScrollView
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
          scrollEventThrottle={16}
        >


          <ImageBackground
            source={require("../../../assets/images/tenantBackground.jpg")}
            style={homeStyles.heroSection}
            imageStyle={homeStyles.heroBgImage}
          >

            {/* TOP ROW */}
            <View style={homeStyles.topRow}>

              <View style={homeStyles.locationWrapper}>

                <Ionicons
                  name="location-outline"
                  size={14}
                  color="#fff"
                />

                <Text
                  numberOfLines={1}
                  style={homeStyles.locationText}
                >
                  {locationName}
                </Text>

              </View>

              <View style={homeStyles.heroIcons}>

                <TouchableOpacity
                  style={homeStyles.heroIconBtn}
                  onPress={() => navigation.navigate("TenantNotification")}
                >
                  <Ionicons
                    name="notifications-outline"
                    size={22}
                    color="#fff"
                  />

                  {newNotifications > 0 && (
                    <View style={homeStyles.heroBadge}>
                      <Text style={homeStyles.heroBadgeText}>
                        {newNotifications}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

              </View>
            </View>

            {/* TITLE */}
            <View style={homeStyles.heroContent}>
              <Text style={homeStyles.heroTitle}>
                Find Your{"\n"}Perfect Space
              </Text>

              <Text style={homeStyles.heroSubtitle}>
                Hostels, Apartments & Commercial spaces near you
              </Text>
            </View>

            {/* SEARCH */}
            <View style={homeStyles.newSearchBar}>

              <Ionicons
                name="search"
                size={20}
                color="#999"
              />

              <TextInput
                style={homeStyles.newSearchInput}
                placeholder="Search location, property..."
                placeholderTextColor="#999"
                value={mainSearch}
                onChangeText={(text) => setMainSearch(text)}
                returnKeyType="search"
                clearButtonMode="while-editing"
                autoCorrect={false}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={homeStyles.filterBtn}
                onPress={() => setModalVisible(true)}
              >
                <Ionicons
                  name="options-outline"
                  size={20}
                  color="#6C63FF"
                />

                <Text style={homeStyles.filterText}>
                  Filters
                  {activeFilterCount > 0
                    ? ` (${activeFilterCount})`
                    : ""}
                </Text>
              </TouchableOpacity>

            </View>

          </ImageBackground>





          {/* STICKY CATEGORY SECTION */}
          <View style={{ backgroundColor: "#fff", paddingBottom: 5 }}>
            <View style={homeStyles.categoryHeadingRow}>
              <Text style={homeStyles.categoryHeading}>
                Explore by Categories
              </Text>
            </View>
            <View style={homeStyles.customCategoryWrapper}>

              {/* HOSTEL */}
              <TouchableOpacity
                style={[homeStyles.customCard, { backgroundColor: "#7c3aed" }]}
                onPress={() => navigation.navigate("HostelScreen")}
              >
                <Image
                  source={require("../../../assets/images/hostelLogo.png")}
                  style={homeStyles.customCardImage}
                  resizeMode="contain"
                />

                <Text style={homeStyles.customCardTitle}>
                  Hostels
                </Text>


              </TouchableOpacity>

              {/* APARTMENT */}
              <TouchableOpacity
                style={[homeStyles.customCard, { backgroundColor: "#60a5fa" }]}
                onPress={() => navigation.navigate("ApartmentScreen")}
              >
                <Image
                  source={require("../../../assets/images/apartmentLogo.png")}
                  style={homeStyles.customCardImage}
                  resizeMode="contain"
                />

                <Text style={homeStyles.customCardTitle}>
                  Apartments
                </Text>


              </TouchableOpacity>

              {/* COMMERCIAL */}
              <TouchableOpacity
                style={[homeStyles.customCard, { backgroundColor: "#fb923c" }]}
                onPress={() => navigation.navigate("CommercialScreen")}
              >
                <Image
                  source={require("../../../assets/images/commercialLogo.png")}
                  style={homeStyles.customCardImage}
                  resizeMode="contain"
                />

                <Text style={homeStyles.customCardTitle}>
                  Commercial
                </Text>


              </TouchableOpacity>

            </View>
          </View>

          {/* Listings */}
          <View style={homeStyles.listHeader}>
            <Text style={homeStyles.listTitle}>{selectedType} Listings</Text>
            <Text style={homeStyles.countText}>
              {filteredProperties.length} items
            </Text>
          </View>

          <View style={homeStyles.propertyGrid}>
            {filteredProperties.map((item) => {
              const normalize = (str) => (str || "").replace(/\s+/g, '').toLowerCase();

              const latestReq = requests.find(r =>
                normalize(r.propertyName || r.property_name) === normalize(item.name)
              );

              const showBadge = latestReq && latestReq.status && latestReq.status !== 'none';

              return (
                <TouchableOpacity
                  key={`${item.id}-${item.type}`}
                  activeOpacity={0.9}
                  style={homeStyles.gridItem}
                  onPress={() => handlePress(item)}
                >
                  <View style={homeStyles.card}>
                    <Image
                      source={{ uri: item.image || item.galleryImages?.[0] }}
                      style={homeStyles.cardImg}
                      resizeMode="cover"
                      onError={() => console.log("Card image failed:", item.image)}
                    />

                    <View style={homeStyles.cardBody}>
                      <View style={homeStyles.row}>
                        <Text style={homeStyles.cardName}>{item.name}</Text>
                        {showBadge ? (
                          <View style={[
                            homeStyles.statusBadge,
                            {
                              backgroundColor:
                                latestReq.status?.toLowerCase() === "accepted" || latestReq.status?.toLowerCase() === "completed" || latestReq.status?.toLowerCase() === "allotted" ? "#2ecc71" :
                                  latestReq.status?.toLowerCase() === "rejected" ? "#e74c3c" :
                                    latestReq.status?.toLowerCase() === "withdrawn" ? "#95a5a6" : "#f39c12"
                            }
                          ]}>
                            <Text style={homeStyles.statusText}>
                              {latestReq.status?.toLowerCase() === "completed" || latestReq.status?.toLowerCase() === "accepted" || latestReq.status?.toLowerCase() === "allotted" ? "ACCEPTED" : latestReq.status.toUpperCase()}
                            </Text>
                          </View>
                        ) : (
                          item.isAvailable && (
                            <View style={[homeStyles.statusBadge, { backgroundColor: "#3498db" }]}>
                              <Text style={homeStyles.statusText}>VACANT</Text>
                            </View>
                          )
                        )}
                      </View>
                      <Text style={homeStyles.cardSub} numberOfLines={2}>
                        {item.type} • {item.address}
                      </Text>
                      {item.rent ? (
                        <Text style={[homeStyles.cardSub, { fontWeight: "bold", color: "#6C63FF", marginTop: 4 }]}>
                          ₹{item.rent} / month
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {filteredProperties.length === 0 && (
            <View style={{ alignItems: "center", marginTop: 50 }}>
              <Ionicons name="search-outline" size={60} color="#ccc" />
              <Text style={homeStyles.noResults}>No properties found.</Text>
            </View>
          )}
        </ScrollView>

        {/* Filter Modal */}
        {/* Filter Modal */}
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={true}
        >
          <View style={homeStyles.modalOverlay}>
            <View style={[homeStyles.modalContent, { height: "80%" }]}>
              <View style={homeStyles.modalHeader}>
                <Text style={homeStyles.modalTitle}>Filters</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close-circle" size={30} color="#333" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 1. NEAR BY RANGE */}
                <Text style={homeStyles.filterLabel}>Near By (Distance)</Text>
                <View style={homeStyles.filterRow}>
                  {[5, 10].map((dist) => (
                    <TouchableOpacity
                      key={dist}
                      style={[
                        homeStyles.chip,
                        nearMe === dist && homeStyles.activeChip,
                      ]}
                      onPress={() => setNearMe(nearMe === dist ? 0 : dist)}
                    >
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color={nearMe === dist ? COLORS.WHITE : COLORS.PRIMARY}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          homeStyles.chipText,
                          nearMe === dist && homeStyles.activeChipText,
                        ]}
                      >
                        Within {dist} KM
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>



                {/* 3. TYPE BASED DYNAMIC UI */}
                <View style={homeStyles.divider} />
                <Text style={homeStyles.filterLabel}>
                  Category
                </Text>

                <View style={homeStyles.categoryTabRow}>

                  {categories.map((cat) => {

                    const active = selectedType === cat.name;

                    const categoryColor =
                      cat.name === "Hostel"
                        ? "#7c3aed"
                        : cat.name === "Apartment"
                          ? "#60a5fa"
                          : cat.name === "Commercial"
                            ? "#fb923c"
                            : "#6C63FF";

                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          homeStyles.categoryTab,
                          {
                            borderColor: active
                              ? categoryColor
                              : "#ececec",

                            backgroundColor: active
                              ? `${categoryColor}12`
                              : "#fff",
                          },
                        ]}
                        onPress={() =>
                          handleSelectType(cat.name)
                        }
                      >
                        <Ionicons
                          name={cat.icon}
                          size={20}
                          color={categoryColor}
                        />

                        <Text
                          style={[
                            homeStyles.categoryTabText,
                            {
                              color: categoryColor,
                            },
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Conditional UI for HOSTEL */}
                {selectedType === "Hostel" && (
                  <View style={homeStyles.subSection}>
                    <Text style={homeStyles.subLabel}>Hostel Type</Text>
                    <View style={homeStyles.filterRow}>
                      {["Boys", "Girls", "Coliving"].map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[
                            homeStyles.chip,
                            selectedHostelType === t && homeStyles.activeChip,
                          ]}
                          onPress={() => setSelectedHostelType(t)}
                        >
                          <Text
                            style={[
                              homeStyles.chipText,
                              selectedHostelType === t &&
                              homeStyles.activeChipText,
                            ]}
                          >
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Conditional UI for APARTMENT */}
                {selectedType === "Apartment" && (
                  <View>
                    <Text style={homeStyles.subLabel}>Tenant / Size</Text>
                    <View style={homeStyles.filterRow}>
                      {["Family", "Bachelor", "1BHK", "2BHK", "3BHK", "4BHK", "5BHK"].map(
                        (t) => (
                          <TouchableOpacity
                            key={t}
                            style={[
                              homeStyles.chip,
                              selectedTenantType === t && homeStyles.activeChip,
                            ]}
                            onPress={() => setSelectedTenantType(t)}
                          >
                            <Text
                              style={[
                                homeStyles.chipText,
                                selectedTenantType === t &&
                                homeStyles.activeChipText,
                              ]}
                            >
                              {t}
                            </Text>
                          </TouchableOpacity>
                        ),
                      )}
                    </View>
                  </View>
                )}

                {/* Conditional UI for COMMERCIAL */}
                {selectedType === "Commercial" && (
                  <View>
                    <Text style={homeStyles.subLabel}>Property Purpose</Text>
                    <View style={homeStyles.filterRow}>
                      {["Office", "Shop", "Coworking", "Warehouse"].map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[
                            homeStyles.chip,
                            selectedCommercialFeature === t &&
                            homeStyles.activeChip,
                          ]}
                          onPress={() => setSelectedCommercialFeature(t)}
                        >
                          <Text
                            style={[
                              homeStyles.chipText,
                              selectedCommercialFeature === t &&
                              homeStyles.activeChipText,
                            ]}
                          >
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {selectedType === "All" && (
                  <Text
                    style={{
                      color: "#999",
                      fontStyle: "italic",
                      marginBottom: 10,
                    }}
                  >
                    Select a category to see specific filters
                  </Text>
                )}

                {/* 4. AMENITIES (Always Shown) */}
                <Text style={homeStyles.filterLabel}>Amenities</Text>
                <View style={homeStyles.filterRow}>
                  {["WiFi", "Parking", "AC", "Gym", "Security", "Laundry"].map(
                    (f) => (
                      <TouchableOpacity
                        key={f}
                        style={[
                          homeStyles.chip,
                          selectedFacilities.includes(f) &&
                          homeStyles.activeChip,
                        ]}
                        onPress={() =>
                          setSelectedFacilities((prev) =>
                            prev.includes(f)
                              ? prev.filter((x) => x !== f)
                              : [...prev, f],
                          )
                        }
                      >
                        <Text
                          style={[
                            homeStyles.chipText,
                            selectedFacilities.includes(f) &&
                            homeStyles.activeChipText,
                          ]}
                        >
                          {f}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>

                {/* Actions */}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                  <TouchableOpacity
                    style={[
                      homeStyles.applyBtn,
                      { flex: 1, backgroundColor: "#eee" },
                    ]}
                    onPress={() => {
                      setSelectedFacilities([]);
                      setSelectedHostelType("");
                      setSelectedTenantType("");
                      setSelectedCommercialFeature("");

                      setNearMe(0);
                      setSelectedType("All");
                      setMainSearch("");
                      setModalVisible(false);
                    }}
                  >
                    <Text style={{ color: "#333" }}>Reset</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[homeStyles.applyBtn, { flex: 2 }]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={{ color: "#fff", fontWeight: "bold" }}>
                      Apply Filters
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider >
  );
}

export function PropertyDetailsScreen(props) {
  const route = useRoute();
  const property = props.property || route?.params?.property;
  const onBack = props.onBack || (() => navigation.goBack());
  const fetchTenantRequests = props.fetchTenantRequests || route?.params?.fetchTenantRequests;
  const fetchProperties = props.fetchProperties || route?.params?.fetchProperties;

  const navigation = useNavigation();
  const { tenantEmail, tenantPhone } = useContext(TenantContext);
  const bookingContext = useContext(BookingContext);
  const { requests = [], setRequests, isJoined } = bookingContext || {};

  // Find initial status from context to avoid flickering
  const initialStatus = requests.find(r => r.propertyName === property.name)?.status || "none";
  const [requestStatus, setRequestStatus] = useState(initialStatus);

  useEffect(() => {
    let interval;

    const fetchStatus = async () => {
      try {
        const tenantPhone = await AsyncStorage.getItem("tenantPhone");
        if (!tenantPhone || !property?.contact) return;

        const res = await fetchWithAuth(
          `${BASE_URL}/api/check_request_status/${encodeURIComponent(tenantPhone)}/${encodeURIComponent(property.contact)}/${encodeURIComponent(property.name)}/`
        );

        const data = await res.json();

        console.log("STATUS API:", data);

        setRequestStatus(data.status);
      } catch (error) {
        console.log("Status fetch error", error);
      }
    };

    fetchStatus(); // initial call

    interval = setInterval(fetchStatus, 5000); // 🔥 poll every 5 sec

    return () => clearInterval(interval);
  }, [property, tenantEmail]);



  // Removed auto-redirect loop to WelcomeScreen for accepted properties

  let buttonText = "Book Now";
  let buttonAction = "book";
  let buttonDisabled = false;
  let buttonColor = COLORS.PRIMARY;

  const normalizedStatus = (requestStatus || "").toLowerCase();

  if (normalizedStatus === "pending") {
    buttonText = "Withdraw Request";
    buttonAction = "withdraw";
    buttonColor = "#f39c12";
  }
  else if (
    ["completed", "joined", "active", "occupied"].includes(normalizedStatus)
  ) {
    buttonText = "Joined";
    buttonAction = "none";
    buttonDisabled = true;
    buttonColor = "#27ae60";
  }
  else if (["accepted", "allotted"].includes(normalizedStatus)) {
    buttonText = "Join Now";
    buttonAction = "status";
    buttonDisabled = false;
    buttonColor = "#2ecc71";
  }
  else if (normalizedStatus === "rejected") {
    buttonText = "Book Now";
    buttonAction = "book";
    buttonColor = COLORS.PRIMARY;
  }
  else {
    buttonText = "Book Now";
    buttonAction = "book";
    buttonColor = COLORS.PRIMARY;
  }
  // const { tenantEmail } = useContext(TenantContext);
  const [reviewImage, setReviewImage] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showCheckInPicker, setShowCheckInPicker] = useState(false);
  const [showCheckOutPicker, setShowCheckOutPicker] = useState(false);

  const [bookingVisible, setBookingVisible] = useState(false);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [sharing, setSharing] = useState("");

  const [bhkType, setBhkType] = useState("");
  const [tenantType, setTenantType] = useState("");
  const [officeType, setOfficeType] = useState("");
  const [area, setArea] = useState("");

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [userRating, setUserRating] = useState(5);
  const [userComment, setUserComment] = useState("");

  const galleryImages =
    property.galleryImages && property.galleryImages.length > 0
      ? property.galleryImages
      : property.image
        ? [property.image]
        : ["https://via.placeholder.com/400"];

  // Add this near your other useState hooks
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [showIdModal, setShowIdModal] = useState(false);
  const [aadharId, setAadharId] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedBackFile, setSelectedBackFile] = useState(null);
  const [selectedSelfie, setSelectedSelfie] = useState(null);
  const [selectedPaymentScreenshot, setSelectedPaymentScreenshot] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handlePickDocument = async (type) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "image/*",
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        if (type === "front") setSelectedFile(asset);
        else if (type === "back") setSelectedBackFile(asset);
        else if (type === "selfie") setSelectedSelfie(asset);
        else if (type === "payment") setSelectedPaymentScreenshot(asset);
      }
    } catch (err) {
      console.log("Error picking document", err);
    }
  };

  const submitIdentityProof = async () => {
    const activePhone = await AsyncStorage.getItem("tenantPhone");
    if (!activePhone) {
      Alert.alert("Error", "Tenant details not found. Please log in again.");
      return;
    }

    if (!selectedFile || !selectedBackFile || !aadharId) {
      Alert.alert("Error", "Please enter Aadhaar ID, and upload Aadhaar Front & Back images.");
      return;
    }

    if (aadharId.length !== 12) {
      Alert.alert("Error", "Aadhaar ID must be exactly 12 numeric digits.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("phone", activePhone);
      formData.append("aadhar_id", aadharId);
      formData.append("aadhar_image", {
        uri: selectedFile.uri,
        name: selectedFile.name || "aadhar_front.jpg",
        type: selectedFile.mimeType || "image/jpeg"
      });
      formData.append("aadhar_back_image", {
        uri: selectedBackFile.uri,
        name: selectedBackFile.name || "aadhar_back.jpg",
        type: selectedBackFile.mimeType || "image/jpeg"
      });

      const res = await fetchWithAuth(`${BASE_URL}/api/tenant/submit_verification/`, {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      });

      const resData = await res.json();

      if (res.ok) {
        setUploading(false);
        setShowIdModal(false);
        Alert.alert("Success", "Identity proof submitted successfully! You are now joined.");
        if (bookingContext?.setRefreshTrigger) {
          bookingContext.setRefreshTrigger(prev => prev + 1);
        }
      } else {
        setUploading(false);
        Alert.alert("Failed to Submit", resData.error || "An unexpected error occurred.");
      }
    } catch (err) {
      setUploading(false);
      console.log("Error submitting identity proof:", err);
      Alert.alert("Error", "Could not submit identity proof. Please check your network.");
    }
  };

  const facilityIcons = {
    WiFi: "wifi",
    Food: "silverware-fork-knife",
    AC: "air-conditioner",
    Laundry: "washing-machine",
    Security: "shield-check",
    "24/7 Security": "shield-check",
    Housekeeping: "broom",
    Parking: "parking",
    Lift: "elevator",
    Gym: "dumbbell",
    "Power Backup": "battery-charging",
    Balcony: "home-floor-1",
    "Conference Room": "account-group",
    Reception: "desk",
    CCTV: "cctv",
    "Central AC": "air-conditioner",
  };


  const reviews = [
    {
      id: "1",
      user: "Rahul S.",
      rating: 5,
      comment:
        "Amazing place! The staff is very helpful and the Wi-Fi is fast.",
      date: "2 days ago",
    },
    {
      id: "2",
      user: "Anjali P.",
      rating: 4,
      comment:
        "Very clean rooms and great location. Highly recommended for students.",
      date: "1 week ago",
    },
    {
      id: "3",
      user: "Amit K.",
      rating: 5,
      comment: "Best value for money in this area. Very secure.",
      date: "Oct 2025",
    },
  ];

  if (!property)
    return (
      <View style={styles.center}>
        <Text>No Property Data</Text>
      </View>
    );

  const onShare = async () => {
    try {
      await Share.share({
        message: `Check out this property: ${property.name}\nLocation: ${property.address || "In the city"}`,
      });
    } catch (error) {
      alert(error.message);
    }
  };

  const zoomImages = galleryImages.map((img) => ({
    url: img,
    props: { resizeMode: "contain" },
  }));

  const handleReviewSubmit = () => {
    if (userRating === 0) {
      alert("Please select a rating!");
      return;
    }
    alert(`Thank you! Review submitted with ${userRating} stars!`);
    setModalVisible(false);
    setUserComment("");
    setUserRating(5); // Reset to default
  };

  const makeCall = () => Linking.openURL(`tel:${property.contact}`);
  const openWhatsApp = () =>
    Linking.openURL(
      `whatsapp://send?phone=${property.contact}&text=Hi, I am interested in ${property.name}`,
    );

  const openInGoogleMaps = () => {
    const latitude = property.latitude;
    const longitude = property.longitude;

    if (!latitude || !longitude) {
      alert("Location not available");
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  const confirmBooking = async () => {
    try {
      if (isJoined) {
        alert("You are already staying in a property. Please vacate or contact the owner before requesting another property.");
        return;
      }
      // --- 1. Date Validation ---
      if (!checkIn.trim()) {
        alert("Please enter a Check-in date");
        return;
      }



      // --- 2. Property Type Validation ---
      if (property.type === "Hostel") {
        const sharingNum = Number(sharing);
        if (!sharing || isNaN(sharingNum) || sharingNum <= 0 || sharingNum > 8) {
          alert("Please enter a valid sharing preference (1 to 8 persons)");
          return;
        }
      }

      if (property.type === "Apartment") {
        if (!bhkType.trim()) {
          alert("Please specify BHK type (e.g., 2BHK)");
          return;
        }
        if (!tenantType) {
          alert("Please select Tenant Type (Family or Bachelor)");
          return;
        }
      }

      if (property.type === "Commercial") {
        const areaNum = Number(area);
        if (!officeType.trim()) {
          alert("Please enter the Office Type");
          return;
        }
        if (!area || isNaN(areaNum) || areaNum <= 0) {
          alert("Please enter a valid area in sq.ft");
          return;
        }
      }

      // --- 3. Booking JSON ---
      const bookingData = {
        propertyId: property.id,
        propertyName: property.name,
        propertyType: property.type,
        address: property.address,
        contact: property.contact,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        sharing: property.type === "Hostel" ? sharing : null,
        bhk: property.type === "Apartment" ? bhkType : null,
        tenantType: property.type === "Apartment" ? tenantType : null,
        officeType: property.type === "Commercial" ? officeType : null,
        area: property.type === "Commercial" ? area : null,
        bookingTime: new Date().toISOString(),
      };

      console.log("Booking JSON:", bookingData);

      // --- 4. Send Join Request ---
      const tenantPhone = await AsyncStorage.getItem("tenantPhone");

      if (!tenantPhone) {
        alert("Tenant phone missing. Please login again.");
        return;
      }

      if (!property.contact) {
        alert("Owner phone missing");
        return;
      }

      console.log("Tenant Phone:", tenantPhone);
      console.log("Owner Phone:", property.contact);

      const response = await fetchWithAuth(
        `${BASE_URL}/api/send_request/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenant_phone: tenantPhone,
            owner_id: property.owner_id || "",
            owner_phone: property.contact,

            property_name: property.name,
            property_type: property.type,

            check_in: checkIn || "N/A",
            check_out: checkOut || "N/A",

            sharing: sharing || "",

            flat: bhkType || "",

            section: officeType || area || "",
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        alert(`Booking Request Sent! 🎉\nWe will contact you shortly regarding ${property.name}.`);
        console.log("Server Response:", data);
        setRequestStatus("pending");
      } else {
        alert("Failed to send booking request");
        console.log("Server Error:", data);

      }

      // --- 5. Reset States ---
      setCheckIn("");
      setCheckOut("");
      setSharing("");
      setBhkType("");
      setOfficeType("");
      setArea("");
      setTenantType("");
      setBookingVisible(false);

    } catch (error) {
      console.log("Booking Error:", error);
      alert("Something went wrong. Please try again.");
    }
  };

  const performWithdraw = async () => {
    try {
      const normalize = (str) => (str || "").replace(/\s+/g, '').toLowerCase();
      console.log("--- WITHDRAW ACTION START ---");
      console.log("Property Name:", property.name);
      console.log("Owner Email:", property.contact);
      console.log("Tenant Phone:", tenantPhone);

      // Optimistic update for immediate feedback in the list
      if (setRequests) {
        console.log("Performing Optimistic Sync...");
        setRequests(prev => {
          return prev.map(r => {
            const rName = normalize(r.propertyName || r.property_name);
            const pName = normalize(property.name);
            const rOwner = normalize(r.contact || r.owner_phone);
            const pOwner = normalize(property.contact);

            const nameMatch = rName === pName;
            const ownerMatch = rOwner === pOwner;

            if (nameMatch && ownerMatch && ["pending", "accepted", "allotted"].includes(r.status)) {
              console.log(`Optimistic Match Found! Updating request ${r.id} to withdrawn`);
              return { ...r, status: "withdrawn" };
            }
            return r;
          });
        });
      }

      const res = await fetch(`${BASE_URL}/api/withdraw_request/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_phone: tenantPhone,
          owner_id: property.owner_id || "",
          owner_phone: property.contact,
          property_name: property.name,
        }),
      });
      const data = await res.json();
      console.log("Withdraw API Response:", data);

      // Final sync from backend
      if (fetchTenantRequests) {
        console.log("Re-fetching tenant requests for final sync...");
        await fetchTenantRequests();
      }
      if (fetchProperties) fetchProperties();
      if (bookingContext?.setRefreshTrigger) {
        bookingContext.setRefreshTrigger(prev => prev + 1);
      }

      setStatusModalVisible(false);
      setRequestStatus("withdrawn");

      if (data.updated_count === 0) {
        console.warn("API reported 0 records updated. Possibly no matching active request.");
        alert("This request was already withdrawn or could not be found.");
        if (fetchTenantRequests) fetchTenantRequests();
      } else {
        console.log(`Successfully withdrawn ${data.updated_count} records.`);
        alert("Request withdrawn successfully. The owner has been notified.");
      }
    } catch (error) {
      console.error("Withdraw Error:", error);
      alert("Failed to withdraw request.");
      if (fetchTenantRequests) fetchTenantRequests();
    }
  };

  const handleBookingAction = async () => {
    try {
      // 👉 OPEN FORM
      if (buttonAction === "book") {
        if (isJoined) {
          Alert.alert(
            "Already Staying",
            "You are already staying in a property. Please vacate or contact the owner before requesting another property."
          );
          return;
        }
        setBookingVisible(true);
        return;
      }

      // 👉 WITHDRAW REQUEST
      if (buttonAction === "withdraw") {
        Alert.alert(
          "Withdraw Request",
          "Are you sure you want to withdraw your booking request?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Withdraw", style: "destructive", onPress: performWithdraw }
          ]
        );
        return;
      }

      // 👉 OPEN STATUS MODAL (For Accepted/Joined)
      if (requestStatus === "accepted" || requestStatus === "completed" || requestStatus === "allotted") {
        if (requestStatus === "completed") {
          setStatusModalVisible(true);
        } else {
          setShowIdModal(true);
        }
        return;
      }
    } catch (error) {
      console.log("Booking action error:", error);
    }
  };
  const pickReviewImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        alert("Permission denied");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const uri = result.assets[0].uri;

        // Get file name
        const fileName = uri.split("/").pop();
        const extension = fileName.split(".").pop().toLowerCase();

        // Check file type
        if (!["jpg", "jpeg", "pdf"].includes(extension)) {
          alert("Only JPG, JPEG or PDF files are allowed");
          return;
        }

        // Check file size
        const fileInfo = await FileSystem.getInfoAsync(uri);
        const sizeInKb = fileInfo.size / 1024;

        console.log("File size:", sizeInKb);

        if (sizeInKb > 100) {
          alert("File must be under 100KB");
          return;
        }

        setReviewImage(uri);
      }
    } catch (error) {
      console.log("Image Picker Error:", error);
      alert("Something went wrong while picking image.");
    }
  };
  useEffect(() => {

    const loadPhone = async () => {

      const phone =
        await AsyncStorage.getItem(
          "tenantPhone"
        );

      console.log(
        "Loaded Tenant Phone:",
        phone
      );
    };

    loadPhone();

  }, []);

  return (
    <View style={[styles.container, { backgroundColor: "#fff" }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Details</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity onPress={onShare} style={styles.backBtn}>
            <Ionicons name="share-outline" size={24} color={COLORS.PRIMARY} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <Image
          source={{ uri: property.image || property.galleryImages?.[0] }}
          style={styles.mainImage}
          onError={() => console.log("Main image failed:", property.image)}
        />

        <View style={styles.content}>
          <View style={styles.row}>
            <Text style={styles.name}>
              {requestStatus === "accepted" ? `Welcome to ${property.name}` : property.name}
            </Text>
            <View style={[
              styles.statusBadge, 
              (requestStatus === "accepted" || requestStatus === "completed" || requestStatus === "allotted") && { backgroundColor: "#2ecc71" },
              requestStatus === "pending" && { backgroundColor: "#f39c12" },
              requestStatus === "rejected" && { backgroundColor: "#e74c3c" }
            ]}>
              <Text style={[
                styles.statusText, 
                (requestStatus === "accepted" || requestStatus === "completed" || requestStatus === "allotted" || requestStatus === "pending" || requestStatus === "rejected") && { color: "#fff" }
              ]}>
                {requestStatus === "accepted" || requestStatus === "completed" || requestStatus === "allotted" ? "Joined" : 
                 requestStatus === "pending" ? "Pending" :
                 requestStatus === "rejected" ? "Rejected" :
                 (property.isAvailable ? "Vacant" : "Full")}
              </Text>
            </View>
          </View>

          <Text style={styles.typeText}>
            {property.type}
          </Text>

          <Text style={{ fontSize: 13, color: COLORS.TEXT_SECONDARY, marginTop: 4, fontWeight: "700" }}>
            Owned by {property.ownerName || "Owner"}
          </Text>

          {property.rent ? (
            <Text style={{ fontSize: 18, color: COLORS.PRIMARY, marginTop: 10, fontWeight: "800" }}>
              ₹{property.rent} / month
            </Text>
          ) : null}

          <Text style={styles.sectionTitle}>Facilities</Text>

          <View style={styles.amenitiesGrid}>
            {property.facilities?.map((facility, index) => {
              const formatted =
                facility.charAt(0).toUpperCase() + facility.slice(1);

              return (
                <View key={`${facility}-${index}`} style={styles.amenityItem}>
                  <MaterialCommunityIcons
                    name={facilityIcons[formatted] || "check-circle"}
                    size={22}
                    color={COLORS.PRIMARY}
                  />
                  <Text style={styles.amenityLabel}>{formatted}</Text>
                </View>
              );
            })}
          </View>

          {/* User Reviews Section */}
          <View style={[styles.row, { marginTop: 25 }]}>
            <Text style={styles.sectionTitle}>User Reviews</Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 15 }}
            >
              <TouchableOpacity onPress={() => setModalVisible(true)}>
                <Text style={styles.seeAllText}>Write review</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => alert("Navigate to all reviews")}
              >
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.reviewScroll}
          >
            {reviews.map((item) => (
              <View key={`${item.id}-${item.type}`} style={styles.reviewCard}>
                <View style={styles.row}>
                  <Text style={styles.reviewUser}>{item.user}</Text>
                  <View style={styles.starBadge}>
                    <Ionicons name="star" size={10} color="#FFD700" />
                    <Text style={styles.starText}>{item.rating}</Text>
                  </View>
                </View>
                <Text style={styles.reviewComment} numberOfLines={3}>
                  {item.comment}
                </Text>
                <Text style={styles.reviewDate}>{item.date}</Text>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.sectionTitle}>Location on Map</Text>
          <View style={styles.mapContainer}>
            {Platform.OS === "web" ? (
              <View
                style={[
                  styles.map,
                  {
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#f0f0f0",
                  },
                ]}
              >
                <Text style={{ marginBottom: 10 }}>
                  Map preview not available on Web
                </Text>

                <TouchableOpacity
                  style={{
                    backgroundColor: COLORS.PRIMARY,
                    paddingHorizontal: 15,
                    paddingVertical: 8,
                    borderRadius: 20,
                  }}
                  onPress={openInGoogleMaps}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>
                    Open in Google Maps
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                region={{
                  latitude: Number(property.latitude),
                  longitude: Number(property.longitude),
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker
                  coordinate={{
                    latitude: Number(property.latitude),
                    longitude: Number(property.longitude),
                  }}
                  title={property.name}
                  description={property.address}
                />
              </MapView>
            )}

            {/* Open in Maps Button */}
            <TouchableOpacity
              style={styles.mapButton}
              onPress={openInGoogleMaps}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>
                Open in Google Maps
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Property Gallery</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.galleryScroll}
          >
            {galleryImages.map((img, index) => (
              <TouchableOpacity
                key={`${img}-${index}`}
                onPress={() => {
                  setViewerIndex(index);
                  setSelectedGalleryIndex(index);
                }}
              >

                <Image
                  source={{ uri: img }}
                  style={styles.galleryImage}
                  onError={() => console.log("Gallery image failed:", img)}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>

        </View>
      </ScrollView>

      {/* --- REVIEW MODAL --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rate your experience</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setReviewImage(null); // Clear image on close
                }}
              >
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.ratingSubtitle}>Tap a star to rate</Text>

            <View style={styles.starRatingRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  activeOpacity={0.7}
                  onPress={() => setUserRating(star)}
                  style={styles.starWrapper}
                >
                  <Ionicons
                    name={star <= userRating ? "star" : "star-outline"}
                    size={40}
                    color={star <= userRating ? "#FFD700" : "#ccc"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.textInput}
              placeholder="How was the stay? The facilities? The location?"
              multiline
              numberOfLines={4}
              value={userComment}
              onChangeText={setUserComment}
            />

            {/* --- NEW: IMAGE UPLOAD SECTION --- */}
            <Text
              style={[
                styles.ratingSubtitle,
                { textAlign: "left", marginBottom: 5 },
              ]}
            >
              Add file (JPG / JPEG / PDF • Max 100KB)
            </Text>
            <View style={styles.uploadContainer}>
              <TouchableOpacity
                style={styles.uploadBox}
                onPress={pickReviewImage}
              >
                {reviewImage ? (
                  <Image
                    source={{ uri: reviewImage }}
                    style={styles.previewThumbnail}
                  />
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <Ionicons name="camera" size={24} color={COLORS.PRIMARY} />
                    <Text style={styles.uploadText}>Upload</Text>
                  </View>
                )}
              </TouchableOpacity>

              {reviewImage && (
                <TouchableOpacity
                  style={styles.removeImgBtn}
                  onPress={() => setReviewImage(null)}
                >
                  <Ionicons name="trash-outline" size={20} color="#ff4d4d" />
                  <Text style={{ color: "#ff4d4d", fontSize: 12 }}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor:
                    userComment.length > 0 ? COLORS.PRIMARY : "#aab8ff",
                },
              ]}
              onPress={() => {
                handleReviewSubmit();
                setReviewImage(null); // Reset image after submit
              }}
            >
              <Text style={styles.submitBtnText}>Submit Review</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- BOOKING MODAL --- */}
      <Modal animationType="slide" transparent visible={bookingVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book Property</Text>
              <TouchableOpacity onPress={() => setBookingVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Check-in & Check-out */}
            {/* CHECK-IN DATE */}
            {Platform.OS === "web" ? (
              <TextInput
                style={styles.input}
                placeholder="Check-in (DD/MM/YYYY)"
                value={checkIn}
                onChangeText={setCheckIn}
              />
            ) : (
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowCheckInPicker(true)}
              >
                <Text>{checkIn || "Select Check-in Date"}</Text>
              </TouchableOpacity>
            )}

            {showCheckInPicker && (
              <DateTimePicker
                value={new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowCheckInPicker(false);
                  if (date) {
                    const formatted =
                      date.getFullYear() +
                      "-" +
                      (date.getMonth() + 1).toString().padStart(2, "0") +
                      "-" +
                      date.getDate().toString().padStart(2, "0");
                    setCheckIn(formatted);
                  }
                }}
              />
            )}

            {/* CHECK-OUT DATE */}
            {Platform.OS === "web" ? (
              <TextInput
                style={styles.input}
                placeholder="Check-out (DD/MM/YYYY)"
                value={checkOut}
                onChangeText={setCheckOut}
              />
            ) : (
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowCheckOutPicker(true)}
              >
                <Text>{checkOut || "Select Check-out Date (Optional)"}</Text>
              </TouchableOpacity>
            )}

            {showCheckOutPicker && (
              <DateTimePicker
                value={new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowCheckOutPicker(false);
                  if (date) {
                    const formatted =
                      date.getFullYear() +
                      "-" +
                      (date.getMonth() + 1).toString().padStart(2, "0") +
                      "-" +
                      date.getDate().toString().padStart(2, "0");
                    setCheckOut(formatted);
                  }
                }}
              />
            )}

            {/* HOSTEL SPECIFIC */}
            {property.type === "Hostel" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Sharing (1-8 Persons) *"
                  keyboardType="number-pad"
                  value={sharing}
                  onChangeText={setSharing}
                />
              </>
            )}

            {/* APARTMENT */}
            {/* APARTMENT */}
            {property.type === "Apartment" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Enter BHK (1-5)"
                  keyboardType="number-pad"
                  value={bhkType}
                  onChangeText={(text) => {
                    const num = text.replace(/[^0-9]/g, "");
                    if (num === "" || (Number(num) >= 1 && Number(num) <= 5)) {
                      setBhkType(num);
                    }
                  }}
                />

                <Text style={{ fontWeight: "600", marginBottom: 10 }}>
                  Tenant Type
                </Text>

                <View
                  style={{ flexDirection: "row", gap: 15, marginBottom: 20 }}
                >
                  {/* FAMILY BUTTON */}
                  <TouchableOpacity
                    style={[
                      styles.tenantBtn,
                      tenantType === "Family" && styles.activeTenantBtn,
                    ]}
                    onPress={() => setTenantType("Family")}
                  >
                    <Text
                      style={[
                        styles.tenantText,
                        tenantType === "Family" && styles.activeTenantText,
                      ]}
                    >
                      Family
                    </Text>
                  </TouchableOpacity>

                  {/* BACHELOR BUTTON (Disabled if FamilyOnly) */}
                  <TouchableOpacity
                    disabled={property.allowedTenants === "FamilyOnly"}
                    style={[
                      styles.tenantBtn,
                      tenantType === "Bachelor" && styles.activeTenantBtn,
                      property.allowedTenants === "FamilyOnly" && {
                        opacity: 0.4,
                      },
                    ]}
                    onPress={() => setTenantType("Bachelor")}
                  >
                    <Text
                      style={[
                        styles.tenantText,
                        tenantType === "Bachelor" && styles.activeTenantText,
                      ]}
                    >
                      Bachelor
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* COMMERCIAL */}
            {property.type === "Commercial" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Office Type (IT / Shop / Startup)"
                  value={officeType}
                  onChangeText={setOfficeType}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Required Area (in sq.ft)"
                  keyboardType="numeric"
                  value={area}
                  onChangeText={setArea}
                />
              </>
            )}

            <TouchableOpacity style={styles.submitBtn} onPress={confirmBooking}>
              <Text style={styles.submitBtnText}>Request to Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.smallBtn} onPress={makeCall}>
          <Ionicons name="call" size={22} color={COLORS.PRIMARY} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallBtn} onPress={openWhatsApp}>
          <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
        </TouchableOpacity>

        {isJoined && buttonAction === "book" ? (
          <View style={{ flex: 1, paddingLeft: 12, justifyContent: "center" }}>
            <Text style={{ color: "#e74c3c", fontSize: 11, fontWeight: "600", textAlign: "center" }}>
              You are already staying in a property. Please vacate or contact the owner before requesting another property.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            disabled={buttonDisabled}
            onPress={handleBookingAction}
            style={{
              backgroundColor: buttonColor,
              flex: 1,
              height: 50,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              opacity: (buttonDisabled && requestStatus !== "accepted") ? 0.6 : 1,
            }}
          >
            <Text
              style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}
            >
              {buttonText}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {/* --- STATUS MODAL (POP-UP) --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={statusModalVisible}
        onRequestClose={() => setStatusModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: 40 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Status</Text>
              <TouchableOpacity onPress={() => setStatusModalVisible(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: "center", marginVertical: 20 }}>
              {requestStatus === "accepted" || requestStatus === "completed" || requestStatus === "allotted" ? (
                <>
                  <MaterialCommunityIcons name="party-popper" size={60} color="#0a9516ff" />
                  <Text style={[styles.modalTitle, { fontSize: 24, marginTop: 15, textAlign: "center" }]}>
                    Welcome to {property.name}! 🎉
                  </Text>
                  <Text style={{ color: "#666", textAlign: "center", marginTop: 10, fontSize: 16 }}>
                    Your request has been accepted by the owner. We're excited to have you!
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="time-outline" size={60} color="#f39c12" />
                  <Text style={[styles.modalTitle, { fontSize: 22, marginTop: 15, textAlign: "center" }]}>
                    Request Sent! ⏳
                  </Text>
                  <Text style={{ color: "#666", textAlign: "center", marginTop: 10, fontSize: 15 }}>
                    The owner has received your request and will review it soon. Please check back later.
                  </Text>
                </>
              )}
            </View>

            <View style={{ gap: 12, marginTop: 10 }}>
              <TouchableOpacity
                onPress={performWithdraw}
                style={[styles.submitBtn, { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ff4d4d" }]}
              >
                <Text style={{ color: "#ff4d4d", fontWeight: "bold", fontSize: 16 }}>
                  Withdraw Request
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStatusModalVisible(false)}
                style={[styles.submitBtn, { backgroundColor: "#f5f5f5" }]}
              >
                <Text style={{ color: "#333", fontWeight: "bold", fontSize: 16 }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- IDENTITY VERIFICATION MODAL --- */}
      <Modal
        visible={showIdModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          if (!uploading) setShowIdModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Identity Verification</Text>
              <TouchableOpacity 
                disabled={uploading} 
                onPress={() => setShowIdModal(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.infoBox}>
                <Ionicons name="shield-checkmark" size={24} color={COLORS.PRIMARY} />
                <Text style={styles.infoText}>
                  Please enter your 12-digit Aadhaar ID and upload a screenshot proof to verify and join the property.
                </Text>
              </View>

              <Text style={styles.inputLabel}>Aadhaar ID *</Text>
              <View style={styles.textInputContainer}>
                <Ionicons name="card-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter 12-digit Aadhaar ID"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  maxLength={12}
                  value={aadharId}
                  onChangeText={(text) => setAadharId(text.replace(/[^0-9]/g, ''))}
                  editable={!uploading}
                />
              </View>

              {/* AADHAAR FRONT */}
              <Text style={styles.inputLabel}>Aadhaar Card Front Image *</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={uploading}
                onPress={() => handlePickDocument("front")}
                style={[
                  styles.verificationUploadContainer,
                  selectedFile && styles.verificationUploadContainerActive
                ]}
              >
                {selectedFile ? (
                  <View style={styles.previewContainer}>
                    <Image source={{ uri: selectedFile.uri }} style={styles.proofImagePreview} />
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {selectedFile.name || "aadhar_front.jpg"}
                      </Text>
                      <Text style={styles.fileSize}>Image selected</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.deleteFileBtn} 
                      disabled={uploading}
                      onPress={() => setSelectedFile(null)}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.ERROR} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="image-outline" size={24} color={COLORS.PRIMARY} />
                    <Text style={styles.uploadTitle}>Choose Aadhaar Front</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* AADHAAR BACK */}
              <Text style={styles.inputLabel}>Aadhaar Card Back Image *</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={uploading}
                onPress={() => handlePickDocument("back")}
                style={[
                  styles.verificationUploadContainer,
                  selectedBackFile && styles.verificationUploadContainerActive
                ]}
              >
                {selectedBackFile ? (
                  <View style={styles.previewContainer}>
                    <Image source={{ uri: selectedBackFile.uri }} style={styles.proofImagePreview} />
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {selectedBackFile.name || "aadhar_back.jpg"}
                      </Text>
                      <Text style={styles.fileSize}>Image selected</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.deleteFileBtn} 
                      disabled={uploading}
                      onPress={() => setSelectedBackFile(null)}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.ERROR} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="image-outline" size={24} color={COLORS.PRIMARY} />
                    <Text style={styles.uploadTitle}>Choose Aadhaar Back</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* LIVE PHOTO / SELFIE */}
              <View style={styles.guidelinesBox}>
                <Text style={styles.guidelineTitle}>Upload Guidelines:</Text>
                <Text style={styles.guidelineItem}>• Document must be clearly visible and not blurry.</Text>
                <Text style={styles.guidelineItem}>• Ensure all four edges of the document are captured.</Text>
                <Text style={styles.guidelineItem}>• High resolution JPG, PNG formats are accepted.</Text>
              </View>
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                disabled={uploading}
                style={[styles.modalActionBtn, styles.cancelBtn]}
                onPress={() => setShowIdModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!selectedFile || !selectedBackFile || !aadharId || uploading}
                style={[
                  styles.modalActionBtn, 
                  styles.submitBtn,
                  (!selectedFile || !selectedBackFile || !aadharId || uploading) && styles.submitBtnDisabled
                ]}
                onPress={submitIdentityProof}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  {uploading ? "Submitting..." : "Get Started"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>



      <Modal
        visible={selectedGalleryIndex !== null}
        transparent={true}
        onRequestClose={() => setSelectedGalleryIndex(null)}
      >
        <View style={{ flex: 1 }}>

          {/* CLOSE BUTTON */}
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 50,
              right: 20,
              zIndex: 10,
              backgroundColor: "rgba(0,0,0,0.6)",
              padding: 8,
              borderRadius: 20,
            }}
            onPress={() => setSelectedGalleryIndex(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {/* IMAGE VIEWER */}
          <ImageViewer
            imageUrls={zoomImages}
            index={viewerIndex}
            enableSwipeDown
            resetImageByChange={true}
            onChange={(index) => setViewerIndex(index)}
            onSwipeDown={() => setSelectedGalleryIndex(null)}
            saveToLocalByLongPress={false}
          />

        </View>
      </Modal>

    </View>
  );
}
const isWeb = Platform.OS === "web";

const homeStyles = StyleSheet.create({
  locationWrapper: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  locationText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 5,
    maxWidth: 220,
  },








  stickyWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: "#fff",
    paddingTop: 45,
    paddingBottom: 8,
    paddingHorizontal: 14,
    elevation: 12,

    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  stickySearchBar: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 46,
  },

  stickyCategoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },

  stickyCategoryBtn: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    marginHorizontal: 3,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },

  activeStickyBtn: {
    backgroundColor: "#6C63FF",
  },

  stickyCategoryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111",
  },






  customCategoryWrapper: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginTop: 10,
    marginBottom: 14,
  },

  customCard: {
    width: "30.5%",
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 4,
    height: 108,
    overflow: "hidden",
  },

  customCardImage: {
    width: "100%",
    height: 88,
    alignSelf: "center",
  },

  customCardTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginTop: -9,
    textAlign: "center",
  },



  subSection: {
    backgroundColor: "#fafafa",
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },




  categoryHeadingRow: {
    paddingHorizontal: 18,
    marginTop: 10,
    marginBottom: 2,
  },

  categoryHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
  },




  heroContent: {
    marginTop: 12,
    width: "58%",
  },
  heroSection: {
    paddingHorizontal: 20,

    paddingTop: 40,
    paddingBottom: 18,

    overflow: "hidden",

    minHeight: 220,
  },

  heroBgImage: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  locationText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  heroIcons: {
    flexDirection: "row",
    alignItems: "center",
  },

  heroIconBtn: {
    marginLeft: 12,
    position: "relative",
  },

  heroBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "red",
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },

  heroBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },

  heroTitle: {
    color: "#fff",
    fontSize: 31,
    fontWeight: "800",
    lineHeight: 38,
  },

  heroSubtitle: {
    color: "#f3f3f3",

    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    width: "95%",
  },

  newSearchBar: {
    marginTop: 25,
    backgroundColor: "#fff",
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    height: 58,
  },

  newSearchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
  },

  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#eee",
    paddingLeft: 12,
  },

  filterText: {
    color: "#6C63FF",
    marginLeft: 5,
    fontWeight: "600",
  },
  notifContainer: {
    position: "relative",
    marginRight: 12,
  },

  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#ff3b30",
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    alignItems: "center",
  },

  headerIcons: { flexDirection: "row", gap: 10 },

  headerTitle: { fontSize: 22, fontWeight: "bold" },

  headerSub: { fontSize: 12, color: "gray" },

  notifBtn: {
    backgroundColor: "#fff",
    padding: 8,
    borderRadius: 10,
    elevation: 1,
  },

  searchWrapper: { paddingHorizontal: 20, marginBottom: 15 },

  searchBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 15,
    paddingHorizontal: 15,
    alignItems: "center",
    height: 50,
    elevation: 3,
  },

  input: { flex: 1, paddingHorizontal: 10 },

  filterTrigger: {
    borderLeftWidth: 1,
    borderLeftColor: "#eee",
    paddingLeft: 10,
  },

  promoWrapper: { marginBottom: 20 },

  promoCard: {
    width: CARD_WIDTH,
    marginRight: 15,
    borderRadius: 20,
    padding: 20,
    height: 120,
    overflow: "hidden",
  },

  promoTextContainer: {
    flex: 1,
    justifyContent: "center",
  },

  promoTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },

  promoDesc: {
    color: "#fff",
    fontSize: 12,
    opacity: 0.8,
  },

  promoIcon: {
    position: "absolute",
    right: -10,
    bottom: -10,
  },

  categoryWrapper: { marginBottom: 20 },

  categoryScroll: { paddingHorizontal: 15 },

  categoryItem: {
    alignItems: "center",
    marginRight: 20,
    width: 70,
  },

  iconBox: {
    width: 50,
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    marginBottom: 5,
  },

  activeIconBox: { backgroundColor: COLORS.PRIMARY },

  categoryLabel: { fontSize: 11, color: "#999" },

  activeCategoryLabel: {
    color: COLORS.PRIMARY,
    fontWeight: "bold",
  },

  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },

  listTitle: { fontSize: 16, fontWeight: "bold" },

  countText: { color: COLORS.PRIMARY, fontSize: 12 },


  gridItem: {
    width: "48%",
    marginBottom: 14,
  },
  propertyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    elevation: 4,
  },

  cardImg: {
    width: "100%",
    height: 120,
    backgroundColor: "#f0f0f0",
  },


  cardBody: { padding: 15 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  cardName: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },

  cardSub: {
    color: "gray",
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
    height: 32,
  },

  noResults: {
    textAlign: "center",
    marginTop: 10,
    color: "gray",
    fontSize: 16,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },

  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },

  applyBtn: {
    backgroundColor: COLORS.PRIMARY,
    padding: 15,
    borderRadius: 15,
    alignItems: "center",
    marginTop: 20,
  },

  filterLabel: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 10,
    color: "#333",
  },

  subLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },

  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 5,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 15,
    paddingVertical: 10,

    borderRadius: 22,

    backgroundColor: "#fafafa",

    borderWidth: 1,
    borderColor: "#ececec",

    marginRight: 10,
    marginBottom: 10,
  },
  activeChip: {
    backgroundColor: "#6C63FF15",
    borderColor: "#6C63FF",
  },

  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#444",
  },

  activeChipText: {
    color: "#6C63FF",
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 15,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 10,
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  categoryTabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },

  categoryTab: {
    flex: 1,

    height: 72,

    justifyContent: "center",
    alignItems: "center",

    borderRadius: 16,

    borderWidth: 1,

    backgroundColor: "#fff",

    marginHorizontal: 4,

    paddingVertical: 8,
  },

  categoryTabText: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    maxWidth: isWeb ? 900 : "100%",
    alignSelf: "center",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  backBtn: { padding: 10, backgroundColor: "#f0f2ff", borderRadius: 12 },
  headerTitle: { fontSize: 18, fontWeight: "bold", marginLeft: 15 },
  mainImage: { width: "100%", height: 280 },
  content: {
    padding: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    backgroundColor: "#fff",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 22, fontWeight: "bold", flex: 1 },
  statusBadge: {
    backgroundColor: "#eef2ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { color: COLORS.PRIMARY, fontWeight: "bold", fontSize: 11 },
  typeText: {
    color: COLORS.PRIMARY,
    fontWeight: "600",
    marginBottom: 15,
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 25,
    marginBottom: 10,
  },
  descriptionText: { color: "#777", lineHeight: 20, fontSize: 14 },
  seeAllText: { color: COLORS.PRIMARY, fontSize: 14, fontWeight: "600" },

  amenitiesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  amenityItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9ff",
    padding: 10,
    borderRadius: 12,
    gap: 5,
  },
  amenityLabel: { fontSize: 12, color: "#555" },

  reviewScroll: { marginTop: 5 },
  reviewCard: {
    width: 220,
    backgroundColor: "#f8f9ff",
    padding: 15,
    borderRadius: 20,
    marginRight: 15,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  reviewUser: { fontWeight: "bold", fontSize: 14 },
  starBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  starText: { fontSize: 10, fontWeight: "bold" },
  reviewComment: { fontSize: 12, color: "#666", marginTop: 8, lineHeight: 18 },
  reviewDate: { fontSize: 10, color: "#bbb", marginTop: 10 },

  mapContainer: {
    height: 160,
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    marginTop: 5,
  },
  map: { ...StyleSheet.absoluteFillObject },
  galleryScroll: { marginTop: 5 },

  footer: {
    position: "absolute",
    bottom: 0,
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#fff",
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    alignItems: "center",
    gap: 8,
  },
  smallBtn: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#f8f9ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#eee",
  },
  requestBtn: {
    flex: 1,
    height: 50,
    borderRadius: 15,
    backgroundColor: COLORS.PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  requestBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 25,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold" },

  submitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  mapButton: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },

  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 15,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: 20,
    fontSize: 16,
  },

  tenantBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },

  activeTenantBtn: {
    backgroundColor: COLORS.PRIMARY,
    borderColor: COLORS.PRIMARY,
  },

  tenantText: {
    fontWeight: "600",
    color: "#333",
  },

  activeTenantText: {
    color: "#fff",
  },

  fullScreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)", // Dark backdrop
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenImage: {
    width: "100%",
    height: "80%",
  },
  closeImageBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
  },
  galleryImage: {
    width: 140,
    height: 90,
    borderRadius: 15,
    marginRight: 12,
    backgroundColor: "#eee",
    borderWidth: 1,
    borderColor: "#eee",
  },

  ratingSubtitle: {
    textAlign: "center",
    color: "#666",
    marginBottom: 10,
    fontSize: 14,
  },
  starRatingRow: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  starWrapper: {
    padding: 5, // Increases touch area
  },
  textInput: {
    backgroundColor: "#f8f9ff",
    borderRadius: 15,
    padding: 15,
    height: 120,
    textAlignVertical: "top",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#eee",
  },
  submitBtn: {
    backgroundColor: COLORS.PRIMARY,
    padding: 18,
    borderRadius: 15,
    alignItems: "center",
    elevation: 2,
    shadowColor: COLORS.PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },

  // ... existing styles ...
  uploadContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginBottom: 20,
  },
  uploadBox: {
    width: 80,
    height: 80,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
    borderStyle: "dashed",
    backgroundColor: "#f8f9ff",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  uploadText: {
    fontSize: 10,
    color: COLORS.PRIMARY,
    fontWeight: "bold",
    marginTop: 2,
  },
  previewThumbnail: {
    width: "100%",
    height: "100%",
  },
  removeImgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: 10,
    backgroundColor: "#fff0f0",
    borderRadius: 10,
  },

  rulesContainer: {
    backgroundColor: "#fdfdff",
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: "#f0f2ff",
    marginTop: 5,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  ruleIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f2ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  ruleText: {
    fontSize: 14,
    color: "#444",
    fontWeight: "500",
  },

  offerScroll: {
    marginVertical: 10,
    marginLeft: -20, // Negative margin to bleed to screen edge
    paddingLeft: 20,
  },
  offerCard: {
    width: 260,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 15,
    marginRight: 15,
    borderWidth: 1.5,
    // Soft shadow
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    position: "relative",
    overflow: "hidden",
    height: 90,
    justifyContent: "center",
  },
  offerBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 15,
  },
  offerBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  offerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  offerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  offerTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
  },
  offerDesc: {
    fontSize: 12,
    color: "#777",
    marginTop: 2,
  },

  // promoHeader: {
  //   flexDirection: 'row',
  //   alignItems: 'center',
  //   justifyContent: 'space-between',
  //   paddingHorizontal: 20,
  //   marginBottom: 5
  // },

  modernPromoCard: {
    width: 280,
    height: 160,
    borderRadius: 24,
    padding: 20,
    marginRight: 15,
    overflow: "hidden", // Clips the decorative circles
    elevation: 8,
    shadowColor: COLORS.PRIMARY,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  // Decorative abstract circles for professional look
  promoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitlePromo: { fontSize: 18, fontWeight: "700", color: "#1a1a1a" },
  premiumOfferCard: {
    width: 260,
    backgroundColor: "#fff",
    borderRadius: 16,
    marginRight: 15,
    flexDirection: "row",
    overflow: "hidden",
    // Elevation for Android
    elevation: 4,
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  colorAccent: {
    width: 6,
    height: "100%",
  },
  offerInnerContent: {
    flex: 1,
    padding: 15,
  },
  offerMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  offerTitleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  offerSubtitleText: {
    fontSize: 11,
    color: "#777",
    marginTop: 2,
  },
  offerSeparator: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginVertical: 12,
    borderStyle: "dashed",
    borderRadius: 1,
  },
  offerBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  couponPill: {
    backgroundColor: "#f8f9ff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e0e5ff",
    borderStyle: "dashed",
  },
  couponPillText: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.PRIMARY,
    letterSpacing: 0.5,
  },
  applyOfferBtn: {
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 8,
  },
  applyOfferText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
  notifContainer: {
    position: "relative",
    marginRight: 12,
  },

  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#ff3b30",
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  modalScrollContent: {
    paddingBottom: 24,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    marginTop: 16,
  },
  textInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  proofImagePreview: {
    width: 60,
    height: 60,
    borderRadius: 12,
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  fileSize: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  deleteFileBtn: {
    padding: 8,
  },
  uploadPlaceholder: {
    alignItems: "center",
    gap: 8,
  },
  uploadTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.PRIMARY,
  },
  guidelinesBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  guidelineTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 8,
  },
  guidelineItem: {
    fontSize: 11,
    color: "#94A3B8",
    marginBottom: 4,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalActionBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: "#F1F5F9",
  },
  cancelBtnText: {
    color: "#64748B",
    fontSize: 16,
    fontWeight: "700",
  },
  submitBtnDisabled: {
    backgroundColor: "#CBD5E1",
  },
  modalCloseBtn: {
    padding: 4,
  },
  verificationUploadContainer: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 100,
    marginBottom: 8,
  },
  verificationUploadContainerActive: {
    borderStyle: "solid",
    borderColor: COLORS.PRIMARY,
    backgroundColor: "#F5F3FF",
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
});

