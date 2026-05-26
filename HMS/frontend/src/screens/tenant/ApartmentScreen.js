import React, { useState, useEffect, useContext } from "react";
import * as Location from "expo-location";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Modal,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import BASE_URL, { fetchWithAuth } from "@/src/config/Api";
import COLORS from "../../theme/colors";
import { TenantContext } from "@/src/context/TenantContext";
import { BookingContext } from "@/src/context/BookingContext";

const { width } = Dimensions.get("window");

export default function ApartmentScreen() {
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const [isModalVisible, setModalVisible] =
  useState(false);

const [selectedBHK, setSelectedBHK] =
  useState("");

const [selectedFacilities, setSelectedFacilities] =
  useState([]);

const [nearBy, setNearBy] = useState(0);

const [userCoords, setUserCoords] =
  useState(null);
  const [properties, setProperties] = useState([]);
  const { tenantEmail } = useContext(TenantContext);

  useEffect(() => {
    fetchApartments();
  }, []);
useEffect(() => {
  getUserLocation();
}, []);
const getUserLocation = async () => {
  try {
    const { status } =
      await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") return;

    const location =
      await Location.getCurrentPositionAsync(
        {}
      );

    setUserCoords({
      latitude:
        location.coords.latitude,
      longitude:
        location.coords.longitude,
    });
  } catch (err) {
    console.log("Location Error:", err);
  }
};
  const fetchApartments = async () => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/owner_props/`);
      const result = await response.json();
      const MEDIA_URL = `${BASE_URL}/media/`;

      const formattedData = result.data
        .filter((item) => item.type === "Apartment")
        .map((item) => {
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
            type: item.type || "Apartment",

            name: item.name || "Unnamed Apartment",
            address: item.address || "No Address",

            image: mainImage || "https://via.placeholder.com/400",
            galleryImages: galleryImages,

           

            facilities: item.facilities || [],

            price: item.rent || "",
            bhk: item.bhk || "2BHK",

            ownerEmail: item.owner_email,
            ownerName: item.owner_name || "Owner",

            contact: item.contact || "No Contact",

            latitude: item.latitude ? parseFloat(item.latitude) : null,
            longitude: item.longitude ? parseFloat(item.longitude) : null,

            isAvailable: item.isAvailable ?? true,
          };
        });

      setProperties(formattedData);
    } catch (error) {
      console.log("Fetch Apartments Error:", error);
    }
  };
  const getDistance = (
  lat1,
  lon1,
  lat2,
  lon2
) => {
  const toRad = (value) =>
    (value * Math.PI) / 180;

  const R = 6371;

  const dLat = toRad(lat2 - lat1);

  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c =
    2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
};

const filteredApartments =
  properties.filter((h) => {

    const searchText = search
  .trim()
  .toLowerCase();

const searchableText = `
  ${h.name || ""}
  ${h.address || ""}
  ${h.bhk || ""}
  ${(h.facilities || []).join(" ")}
`
  .toLowerCase()
  .replace(/,/g, " ")
  .replace(/\s+/g, " ");

const matchesSearch =
  searchText === "" ||
  searchableText.includes(searchText);

   const matchesBHK =
  selectedBHK === "" ||
  (h.bhk || "")
    .replace(/\s/g, "")
    .toLowerCase() ===
  selectedBHK
    .replace(/\s/g, "")
    .toLowerCase();

    const matchesFacilities =
      selectedFacilities.length === 0 ||
      selectedFacilities.every((f) =>
        h.facilities?.includes(f)
      );

    const matchesNearBy =
      nearBy === 0 ||
      (
        userCoords &&
        h.latitude != null &&
        h.longitude != null &&
        getDistance(
          userCoords.latitude,
          userCoords.longitude,
          h.latitude,
          h.longitude
        ) <= nearBy
      );

    return (
      matchesSearch &&
      matchesBHK &&
      matchesFacilities &&
      matchesNearBy
    );
  });

  const shortenAddress = (address) => {
    if (!address) return "No Address";
    const parts = address.split(',').map(s => s.trim());
    if (parts.length > 2) {
      return `${parts[0]}, ${parts[parts.length - 2]}`;
    }
    return address;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Hero Section */}
        <LinearGradient
          colors={["#2563eb", "#60a5fa"]}
          style={styles.hero}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroContent}>
            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTitle}>Apartments</Text>
              <Text style={styles.heroSubtitle}>Modern & Spacious</Text>
            </View>
            <Image
              source={require("../../../assets/images/apartmentLogo.png")}
              style={styles.heroImage}
              resizeMode="contain"
            />
          </View>
        </LinearGradient>

        {/* Search Bar Container */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search location, property or owner..."
              value={search}
              onChangeText={setSearch}
            />
            <TouchableOpacity
  style={styles.filterBtn}
  onPress={() => setModalVisible(true)}
>
              <Ionicons name="options-outline" size={20} color="#2563eb" />
              <Text style={styles.filterText}>Filters</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Modern Living Spaces</Text>

          {filteredApartments.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => navigation.navigate("PropertyDetailsScreen", { property: item })}
            >
              <Image source={{ uri: item.image || item.galleryImages?.[0] }} style={styles.cardImage} />
              <View style={styles.cardDetails}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardAddress} numberOfLines={1}>{shortenAddress(item.address)}</Text>

                

                <View style={styles.tagRow}>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{item.bhk}</Text>
                  </View>
                  {item.facilities.slice(0, 2).map((fac, idx) => (
                    <View key={idx} style={styles.tag}>
                      <Text style={styles.tagText}>{fac}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.priceText}>₹{item.price}</Text>
                  <Text style={styles.pricePeriod}>/month</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {filteredApartments.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>No apartments found</Text>
            </View>
          )}
        </View>
      </ScrollView>
      <Modal
  visible={isModalVisible}
  animationType="slide"
  transparent
>
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>

      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>
          Apartment Filters
        </Text>

        <TouchableOpacity
          onPress={() =>
            setModalVisible(false)
          }
        >
          <Ionicons
            name="close"
            size={28}
            color="#333"
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
      >

        {/* NEAR ME */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
            gap: 6,
          }}
        >
          <Ionicons
            name="location"
            size={18}
            color="#2563eb"
          />

          <Text style={styles.filterLabel}>
            Near Me
          </Text>
        </View>

        <View style={styles.filterRow}>
          {[0, 5, 10, 20].map((km) => (
            <TouchableOpacity
              key={km}
              style={[
                styles.chip,
                nearBy === km &&
                  styles.activeChip,
              ]}
              onPress={() =>
                setNearBy(km)
              }
            >
              <Text
                style={[
                  styles.chipText,
                  nearBy === km &&
                    styles.activeChipText,
                ]}
              >
                {km === 0
                  ? "All"
                  : `${km} KM`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* BHK */}
        <View
  style={{
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  }}
>
  <Ionicons
    name="business"
    size={18}
    color="#2563eb"
  />

  <Text style={styles.filterLabel}>
    BHK Type
  </Text>
</View>

        <View style={styles.filterRow}>
          {[
            "1BHK",
            "2BHK",
            "3BHK",
            "4BHK",
            "5BHK",
          ].map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.chip,
                selectedBHK === t &&
                  styles.activeChip,
              ]}
              onPress={() =>
                setSelectedBHK(
                  selectedBHK === t
                    ? ""
                    : t
                )
              }
            >
              <Text
                style={[
                  styles.chipText,
                  selectedBHK === t &&
                    styles.activeChipText,
                ]}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* FACILITIES */}
        <Text style={styles.filterLabel}>
          Facilities
        </Text>

        <View style={styles.filterRow}>
          {[
            "Lift",
            "Parking",
            "Gym",
            "Security",
            "Power Backup",
            "WiFi",
          ].map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.chip,
                selectedFacilities.includes(f) &&
                  styles.activeChip,
              ]}
              onPress={() =>
                setSelectedFacilities((prev) =>
                  prev.includes(f)
                    ? prev.filter(
                        (x) => x !== f
                      )
                    : [...prev, f]
                )
              }
            >
              <Text
                style={[
                  styles.chipText,
                  selectedFacilities.includes(f) &&
                    styles.activeChipText,
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* BUTTONS */}
        <View style={styles.actionRow}>

          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              setSelectedBHK("");
              setSelectedFacilities([]);
              setNearBy(0);
            }}
          >
            <Text style={styles.resetText}>
              Reset
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() =>
              setModalVisible(false)
            }
          >
            <View
  style={{
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  }}
>
  <Ionicons
    name="checkmark-circle"
    size={18}
    color="#fff"
  />

  <Text style={styles.applyText}>
    Apply Filters
  </Text>
</View>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </View>
  </View>
</Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fb",
  },
  hero: {
    height: 240,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  backBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  heroContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  heroTextContainer: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
  },
  heroSubtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    marginTop: 5,
  },
  heroImage: {
    width: 120,
    height: 120,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: -30,
  },
  searchBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 15,
    height: 60,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#333",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#eee",
    paddingLeft: 12,
    marginLeft: 10,
  },
  filterText: {
    color: "#2563eb",
    marginLeft: 5,
    fontWeight: "600",
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 20,
    marginTop: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 12,
    flexDirection: "row",
    marginBottom: 15,
    height: 135,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  cardImage: {
    width: 110,
    height: 110,
    borderRadius: 20,
  },
  cardDetails: {
    flex: 1,
    marginLeft: 15,
    justifyContent: "space-between",
  },
  cardName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  cardAddress: {
    fontSize: 12,
    color: "#777",
    marginTop: 2,
  },

  tagRow: {
    flexDirection: "row",
    marginTop: 8,
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 10,
    color: "#2563eb",
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 50,
  },
  emptyText: {
    color: "#999",
    marginTop: 10,
    fontSize: 16,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 8,
  },
  priceText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2563eb",
  },
  pricePeriod: {
    fontSize: 12,
    color: "#777",
    marginLeft: 2,
  },
  modalOverlay: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.4)",
  justifyContent: "flex-end",
},

modalContent: {
  backgroundColor: "#fff",
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  padding: 20,
  maxHeight: "78%",
},

modalHeader: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
},

modalTitle: {
  fontSize: 20,
  fontWeight: "800",
  color: "#111",
},

filterLabel: {
  fontSize: 15,
  fontWeight: "700",
  marginBottom: 12,
  marginTop: 10,
},

filterRow: {
  flexDirection: "row",
  flexWrap: "wrap",
  marginBottom: 10,
},

chip: {
  paddingHorizontal: 16,
  paddingVertical: 11,
  borderRadius: 22,
  backgroundColor: "#fafafa",
  marginRight: 10,
  marginBottom: 10,
  borderWidth: 1,
  borderColor: "#ececec",
},

activeChip: {
  backgroundColor: "#2563eb15",
  borderColor: "#2563eb",
},

chipText: {
  color: "#555",
  fontWeight: "600",
},

activeChipText: {
  color: "#2563eb",
  fontWeight: "700",
},

actionRow: {
  flexDirection: "row",
  marginTop: 30,
  gap: 10,
},

resetBtn: {
  flex: 1,
  height: 50,
  borderRadius: 14,
  backgroundColor: "#f3f4f6",
  justifyContent: "center",
  alignItems: "center",
},

applyBtn: {
  flex: 2,
  height: 50,
  borderRadius: 14,
  backgroundColor: "#2563eb",
  justifyContent: "center",
  alignItems: "center",
},

resetText: {
  fontWeight: "700",
  color: "#444",
},

applyText: {
  fontWeight: "700",
  color: "#fff",
},
});
