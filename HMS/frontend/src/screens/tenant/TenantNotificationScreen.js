


import React, { useContext, useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BookingContext } from "@/src/context/BookingContext";
import { TenantContext } from "@/src/context/TenantContext";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import BASE_URL, { fetchWithAuth } from "@/src/config/Api";
import COLORS from "../../theme/colors";
const TenantNotificationScreen = () => {
  const navigation = useNavigation();
  const { tenantPhone } = useContext(TenantContext);
  const { requests, setRequests, refreshTrigger, markAllAsSeen, clearAllNotifications, clearedIds } = useContext(BookingContext);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningIds, setJoiningIds] = useState([]);

  const handleReject = async (item) => {
    import("react-native").then(({ Alert }) => {
      Alert.alert(
        "Reject Approval",
        "Are you sure you want to reject this booking? This action cannot be undone.",
        [
          { text: "No", style: "cancel" },
          {
            text: "Yes, Reject",
            style: "destructive",
            onPress: async () => {
              try {
                const res = await fetchWithAuth(`${BASE_URL}/api/withdraw_request/`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    tenant_phone: tenantPhone,
                    owner_phone: item.owner_phone || item.ownerEmail,
                    property_name: item.propertyName || item.property_name,
                  }),
                });
                if (res.ok) {
                  fetchRequests();
                }
              } catch (err) {
                console.log("Reject error", err);
              }
            }
          }
        ]
      );
    });
  };

  const handleJoinNow = (item) => {
    if (joiningIds.includes(item.id)) return;

    setJoiningIds(prev => [...prev, item.id]);

    navigation.replace("WelcomeScreen", {
      propertyName: item.propertyName || item.property_name,
      requestId: item.id,
    });
  };

  const fetchRequests = async () => {
    if (!tenantPhone) return;

    setRefreshing(true);

    try {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/tenant_notifications/${encodeURIComponent(tenantPhone)}/`
      );

      const data = await res.json();

      console.log("TENANT NOTIFICATIONS:", data);

      setRequests(data);
    } catch (error) {
      console.log("Error fetching notifications", error);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [tenantPhone, refreshTrigger])
  );

  // Mark all as seen when requests are loaded
  useEffect(() => {
    if (requests.length > 0) {
      markAllAsSeen();
    }
  }, [requests]);

  const onRefresh = useCallback(() => {
    fetchRequests();
  }, [tenantPhone]);

  const getData = (item) => {
    if (item.type === "PAYMENT") {
      const pStatus = (item.status || "PENDING").toUpperCase();
      if (pStatus === "SUCCESS") {
        return {
          title: "Payment Approved",
          message: `Your payment of ₹${item.amount} for ${item.propertyName} has been verified.`,
          icon: "card",
          color: COLORS.SUCCESS,
          lightColor: "#E8F5E9",
        };
      }
      if (pStatus === "FAILED" || pStatus === "REJECTED") {
        return {
          title: "Payment Declined",
          message: `Your payment of ₹${item.amount} was rejected. Please contact the owner.`,
          icon: "close-circle",
          color: COLORS.ERROR,
          lightColor: "#FFEBEE",
        };
      }
      return {
        title: "Payment Processing",
        message: `Your payment of ₹${item.amount} is currently under verification.`,
        icon: "time-outline",
        color: COLORS.WARNING,
        lightColor: "#FFF8E1",
      };
    }

    const status = (item.status || "pending").toLowerCase();
    if (status === "accepted") {
      return {
        title: "Booking Approved",
        message: "Great news! Your booking request has been approved.",
        icon: "checkmark-circle",
        color: COLORS.SUCCESS,
        lightColor: "#E8F5E9",
      };
    }
    if (status === "rejected") {
      return {
        title: "Booking Declined",
        message: "We're sorry, your booking request was not accepted.",
        icon: "close-circle",
        color: COLORS.ERROR,
        lightColor: "#FFEBEE",
      };
    }
    if (status === "withdrawn") {
      return {
        title: "Request Withdrawn",
        message: "You have cancelled your join request for this property.",
        icon: "close-circle-outline",
        color: COLORS.TEXT_LIGHT,
        lightColor: "#F5F5F5",
      };
    }
    return {
      title: "Request Pending",
      message: "Your application is currently being reviewed by the owner.",
      icon: "time",
      color: COLORS.WARNING,
      lightColor: "#FFF8E1",
    };
  };

  const groupNotifications = (notifs) => {
    const sorted = [...notifs].sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));
    const groups = { Today: [], Yesterday: [], Earlier: [] };
    const now = new Date();

    sorted.forEach((item) => {
      const date = new Date(item.createdAt || item.created_at);
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) groups.Today.push(item);
      else if (diffDays === 1) groups.Yesterday.push(item);
      else groups.Earlier.push(item);
    });

    return groups;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (isToday) {
      return `Today, ${timeStr}`;
    }
    if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    }

    const dateOptions = { month: "short", day: "numeric" };
    if (date.getFullYear() !== now.getFullYear()) {
      dateOptions.year = "numeric";
    }

    return `${date.toLocaleDateString("en-US", dateOptions)}, ${timeStr}`;
  };

  const visibleRequests = requests.filter(r => !clearedIds.includes(r.id));
  const filteredRequests = visibleRequests; // No longer grouping by property to show multiple payment attempts
  const grouped = groupNotifications(filteredRequests);

  const renderCard = (item) => {
    const data = getData(item);
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.7}
        style={styles.cardContainer}
        onPress={() => {
          if (item.type === "PAYMENT") {
            navigation.navigate("TenantNavigation", {
              screen: "Payment",
            });
          } else {
            // Navigate to Home tab and open property details
            navigation.navigate("TenantNavigation", {
              screen: "Home",
              params: { propertyName: item.propertyName },
            });
          }
        }}
      >
        <View style={styles.card}>
          <View style={[styles.statusIndicator, { backgroundColor: data.color }]} />

          <View style={[styles.iconContainer, { backgroundColor: data.lightColor }]}>
            <Ionicons name={data.icon} size={24} color={data.color} />
          </View>

          <View style={styles.content}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{data.title}</Text>
              <Text style={styles.timeText}>
                {formatDate(item.createdAt || item.created_at)}
              </Text>
            </View>
            <Text style={styles.cardMessage} numberOfLines={2}>
              {data.message}
            </Text>
            <View style={styles.footer}>
              <Ionicons name="business-outline" size={14} color={COLORS.TEXT_PRIMARY} />
              <Text style={[styles.propertyName, { fontWeight: "bold", color: COLORS.TEXT_PRIMARY }]}>
                {item.propertyName || item.property_name}
              </Text>
            </View>

            {(item.status || "").toLowerCase() === "accepted" && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { backgroundColor: joiningIds.includes(item.id) ? COLORS.BORDER : COLORS.SUCCESS }
                  ]}
                  onPress={() => handleJoinNow(item)}
                  disabled={joiningIds.includes(item.id)}
                >
                  <Text style={styles.actionBtnText}>
                    {joiningIds.includes(item.id) ? "Joining..." : "Join Now"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.ERROR, marginLeft: 10 }]}
                  onPress={() => handleReject(item)}
                >
                  <Text style={styles.actionBtnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Ionicons name="chevron-forward" size={20} color={COLORS.BORDER} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>Stay updated on your booking status</Text>
        </View>
        <View style={styles.headerActions}>
          {visibleRequests.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                import("react-native").then(({ Alert }) => {
                  Alert.alert(
                    "Clear All",
                    "Are you sure you want to clear all notifications?",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Clear All", onPress: clearAllNotifications, style: "destructive" }
                    ]
                  );
                });
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={fetchRequests} style={styles.refreshIcon}>
            <Ionicons name="refresh" size={22} color={COLORS.PRIMARY} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.PRIMARY]} />
        }
      >
        {visibleRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="notifications-done" size={80} color={COLORS.PRIMARY_LIGHT} />
            </View>
            <Text style={styles.emptyTitle}>All cleared!</Text>
            <Text style={styles.emptyText}>You're all caught up with your notifications.</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([title, items]) => (
            items.length > 0 && (
              <View key={title} style={styles.section}>
                <Text style={styles.sectionTitle}>{title}</Text>
                {items.map(renderCard)}
              </View>
            )
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FBFBFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.TEXT_PRIMARY,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.TEXT_LIGHT,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F5F3FF",
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.ERROR,
  },
  refreshIcon: {
    padding: 8,
    backgroundColor: "#F5F3FF",
    borderRadius: 12,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.TEXT_LIGHT,
    marginHorizontal: 20,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardContainer: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.WHITE,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  statusIndicator: {
    position: "absolute",
    left: 0,
    top: 20,
    bottom: 20,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.PRIMARY,
  },
  cardMessage: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 2,
    lineHeight: 18,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.PRIMARY,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  propertyName: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.TEXT_LIGHT,
    marginLeft: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
    paddingHorizontal: 40,
  },
  emptyIconBg: {
    width: 150,
    height: 150,
    backgroundColor: "#F5F3FF",
    borderRadius: 75,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.TEXT_LIGHT,
    textAlign: "center",
    lineHeight: 24,
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    color: COLORS.WHITE,
    fontWeight: "bold",
    fontSize: 13,
  },
});

export default TenantNotificationScreen;
