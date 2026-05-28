import React, { useContext, useRef, useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Platform, TouchableOpacity, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import OwnerHomeScreen from "../screens/owner/OwnerHomeScreen";
import OwnerIssuesScreen from "../screens/owner/OwnerIssuesScreen";
import OwnerPaymentScreen from "../screens/owner/OwnerPaymentScreen";
import OwnerProfileScreen from "../screens/owner/OwnerProfileScreen";
import AccountSwitcherSheet from "../components/AccountSwitcherSheet";
import { BookingContext } from "../context/BookingContext";
import { useLanguage } from "../utils/LanguageContext";
import BASE_URL, { fetchWithAuth, WS_BASE_URL } from "../config/Api";

import COLORS from "../theme/colors";

const Tab = createBottomTabNavigator();

export default function OwnerNavigation({ route, navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { requests } = useContext(BookingContext);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  // --- Account Switcher State ---
  const bottomSheetRef = useRef(null);
  const [loggedInAccounts, setLoggedInAccounts] = useState([]);

  const loadLoggedInAccounts = async () => {
    try {
      const activeOwnerPhone = await AsyncStorage.getItem('ownerPhone');
      if (activeOwnerPhone) {
        const response = await fetchWithAuth(`${BASE_URL}/api/owner_accounts/${encodeURIComponent(activeOwnerPhone)}/`);
        if (response.ok) {
          const resData = await response.json();
          if (resData && resData.accounts) {
            setLoggedInAccounts(resData.accounts);
            await AsyncStorage.setItem('loggedInOwnerAccounts', JSON.stringify(resData.accounts));
            return;
          }
        }
      }
    } catch (e) {
      console.log('Load accounts backend error:', e);
    }

    try {
      const raw = await AsyncStorage.getItem('loggedInOwnerAccounts');
      if (raw) {
        setLoggedInAccounts(JSON.parse(raw));
      }
    } catch (e) {
      console.log('Load accounts error:', e);
    }
  };

  useEffect(() => {
    loadLoggedInAccounts();
  }, []);

  // Reload accounts whenever this navigator is focused
  useFocusEffect(
    useCallback(() => {
      loadLoggedInAccounts();
    }, [])
  );

  const handleSwitchAccount = async (account) => {
    try {
      await AsyncStorage.setItem('ownerPhone', account.id);
      bottomSheetRef.current?.close();
      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'OwnerNavigation', params: { phone: account.id } }],
        });
      }, 350);
    } catch (e) {
      console.log('Switch account error:', e);
    }
  };

  const handleAddAccount = () => {
    bottomSheetRef.current?.close();
    setTimeout(() => {
      navigation.navigate('OwnerLoginScreen');
    }, 350);
  };

  const openAccountSwitcher = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    loadLoggedInAccounts(); // Refresh before showing
    bottomSheetRef.current?.snapToIndex(0);
  };

  // Get current active phone
  const [activePhone, setactivePhone] = useState('');
  useEffect(() => {
    (async () => {
      const phone = await AsyncStorage.getItem('ownerPhone');
      if (phone) setactivePhone(phone.trim());
    })();
  }, []);

  // Listen for suspension events
  useEffect(() => {
    if (!activePhone) return;

    const wsUrl = `${WS_BASE_URL}/ws/owner-status/${encodeURIComponent(activePhone)}/`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "account_status" && msg.status === "suspend") {
          let reasonText = msg.message || "Your account has been suspended by admin.";
          try {
            const res = await fetchWithAuth(`${BASE_URL}/api/get_suspension_reason/${encodeURIComponent(activePhone)}/`);
            if (res.ok) {
              const data = await res.json();
              if (data.reason) reasonText = data.reason;
            }
          } catch (err) {}

          Alert.alert(
            t("account_suspended") || "Account Suspended",
            reasonText,
            [
              {
                text: "OK",
                onPress: async () => {
                  await AsyncStorage.multiRemove(["userToken", "ownerPhone"]);
                  // Also remove from logged in accounts if desired, but they will be blocked anyway on next login
                  navigation.reset({ index: 0, routes: [{ name: "OwnerLoginScreen" }] });
                }
              }
            ],
            { cancelable: false }
          );
        }
      } catch (err) {}
    };

    return () => {
      ws.close();
    };
  }, [activePhone, navigation, t]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: COLORS.PRIMARY,
          tabBarInactiveTintColor: "gray",
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            fontFamily: Platform.OS === "ios" ? "Helvetica" : "sans-serif",
          },
          tabBarStyle: {
            backgroundColor: "#ffffff",
            height: Platform.OS === "ios" ? 84 : 64 + insets.bottom,
            paddingBottom: Platform.OS === "ios" ? 24 : 10 + insets.bottom,
            paddingTop: 8,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: -4 },
            elevation: 8,
            borderTopWidth: 1,
            borderTopColor: "#EEF2F6",
          },
          tabBarIcon: ({ color, size }) => {
            let iconName = "";
            if (route.name === "Home") iconName = "home";
            else if (route.name === "Payment") iconName = "card";
            else if (route.name === "Issues") iconName = "alert-circle";
            else if (route.name === "Profile") iconName = "person";

            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen
          name="Home"
          component={OwnerHomeScreen}
          initialParams={{ phone: route.params?.phone }}
          options={{ tabBarLabel: t('dashboard') }}
        />
        <Tab.Screen name="Issues" component={OwnerIssuesScreen} options={{ tabBarLabel: t('issues') }} />
        <Tab.Screen name="Payment" component={OwnerPaymentScreen} options={{ tabBarLabel: t('payments') }} />
        <Tab.Screen
          name="Profile"
          component={OwnerProfileScreen}
          options={{
            tabBarLabel: t('Account'),
            tabBarButton: (props) => (
              <Pressable
                {...props}
                onLongPress={openAccountSwitcher}
                delayLongPress={500}
                android_ripple={{ color: 'rgba(124, 58, 237, 0.1)', borderless: true }}
              />
            ),
          }}
        />
      </Tab.Navigator>

      {/* Account Switcher Bottom Sheet - renders above tabs */}
      <AccountSwitcherSheet
        ref={bottomSheetRef}
        accounts={loggedInAccounts}
        activePhone={activePhone}
        onSwitchAccount={handleSwitchAccount}
        onAddAccount={handleAddAccount}
        onClose={() => { }}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    right: -6,
    top: -3,
    backgroundColor: "red",
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
});



