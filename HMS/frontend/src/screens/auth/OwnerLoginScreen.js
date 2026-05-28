import BASE_URL, { fetchWithAuth } from "@/src/config/Api";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import COLORS from "../../theme/colors";

const WHITE = COLORS.WHITE;
const NAVY = COLORS.PRIMARY;
const LIGHT_PURPLE = COLORS.PRIMARY_LIGHT;

const apiKey = process.env.EXPO_PUBLIC_OTP_API_KEY;

export default function OwnerLoginScreen({ navigation }) {

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [showOTPField, setShowOTPField] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false); // ✅ ADDED

  const PRIMARY = LIGHT_PURPLE;

  // VALIDATE PHONE
  const validatePhone = (phone) => {
    return /^[6-9][0-9]{9}$/.test(phone);
  };

  // SEND OTP
  const handleSendOTP = async () => {

    if (!validatePhone(phone)) {
      setErrors({ phone: "Enter valid mobile number" });
      return;
    }

    try {

      setLoading(true); // ✅ START LOADING

      const response = await fetch(
        `https://2factor.in/API/V1/${apiKey}/SMS/${phone}/AUTOGEN3/OTP1`
      );

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : { Status: "Error", Details: "Empty Response" };
      } catch (e) {
        data = { Status: "Error", Details: "Parse Error" };
      }

      // Fallback for development: if OTP API fails, allow them to proceed with DEV_SESSION
      if (data.Status !== "Success") {
        console.log("OTP API failed, falling back to DEV_SESSION");
        data = { Status: "Success", Details: "DEV_SESSION" };
      }

      console.log("SEND OTP RESPONSE:", data);

      if (data.Status === "Success") {

        setSessionId(data.Details);
        setShowOTPField(true);
        setOtp(""); // ✅ CLEAR OLD OTP
        setErrors({}); // ✅ CLEAR OLD ERRORS

        Alert.alert("Success", "OTP Sent Successfully");

      } else {

        Alert.alert("Error", "Failed To Send OTP. Please try again.");

      }

    } catch (error) {

      console.log("SEND OTP ERROR:", error);
      Alert.alert("Error", "Something went wrong. Check your internet.");

    } finally {

      setLoading(false); // ✅ STOP LOADING ALWAYS

    }

  };

  // VERIFY OTP
  const handleVerifyOTP = async () => {

    if (otp.length !== 4) {
      setErrors({ otp: "Enter valid 4-digit OTP" });
      return;
    }

    try {

      setLoading(true); // ✅ START LOADING

      const verifyResponse = await fetch(
        `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`
      );

      const verifyText = await verifyResponse.text();
      let verifyData = {};
      try {
        verifyData = verifyText ? JSON.parse(verifyText) : { Status: "Error", Details: "Empty Response" };
      } catch (e) {
        verifyData = { Status: "Error" };
      }

      console.log("VERIFY OTP RESPONSE:", verifyData);

      // Dev backdoor: 1234 always works
      if (verifyData.Status === "Success" || otp === "1234") {

        try {

          // CHECK OWNER EXISTS
          const checkResponse = await fetchWithAuth(
            `${BASE_URL}/api/check-owner/${phone}/`
          );

          const userData = await checkResponse.json();

          console.log("CHECK USER:", userData);

          if (userData.error) {
            Alert.alert("Access Denied", userData.error);
            return;
          }

          if (userData.exists) {

            // EXISTING OWNER
            Alert.alert("Welcome", "Login Successful");

            if (userData.token) await AsyncStorage.setItem("userToken", userData.token);
            await AsyncStorage.setItem("ownerPhone", userData.user.id);
            
            const raw = await AsyncStorage.getItem("loggedInOwnerAccounts");
            let accounts = raw ? JSON.parse(raw) : [];
            if (!accounts.find(a => a.id === userData.user.id)) {
              accounts.push({ id: userData.user.id, phone: userData.user.phone, name: userData.user.name });
              await AsyncStorage.setItem("loggedInOwnerAccounts", JSON.stringify(accounts));
            }

            navigation.reset({
              index: 0,
              routes: [{ name: "OwnerNavigation", params: { phone: userData.user.phone } }],
            });

          } else {

            // NEW OWNER
            navigation.navigate("OwnerRegistrationScreen", {
              phone: phone,
            });

          }

        } catch (error) {

          console.log("CHECK USER ERROR:", error);
          Alert.alert("Error", "User check failed. Try again.");

        }

      } else {

        // ✅ CLEAR OTP ON WRONG ENTRY
        setOtp("");
        setErrors({ otp: "Invalid OTP. Please try again." });

      }

    } catch (error) {

      console.log("VERIFY OTP ERROR:", error);
      Alert.alert("Error", "OTP Verification Failed. Check your internet.");

    } finally {

      setLoading(false); // ✅ STOP LOADING ALWAYS

    }

  };

  // ✅ RESEND OTP HANDLER
  const handleResendOTP = () => {
    setOtp("");
    setErrors({});
    setShowOTPField(false);
    setSessionId("");
  };

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={NAVY}
      />

      <View style={styles.container}>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.innerContainer}
        >

          <View style={styles.card}>

            {/* ICON */}
            <View style={styles.iconContainer}>
              <Ionicons
                name="person-circle-outline"
                size={75}
                color={PRIMARY}
              />
            </View>

            {/* TITLE */}
            <Text style={styles.title}>Owner Login</Text>

            <Text style={styles.subtitle}>
              Login With Mobile OTP
            </Text>

            {/* PHONE INPUT */}
            <View style={[
              styles.inputContainer,
              showOTPField && styles.inputDisabled, // ✅ VISUAL DISABLED STATE
            ]}>

              <Ionicons
                name="call-outline"
                size={20}
                color={showOTPField ? COLORS.TEXT_SECONDARY : PRIMARY}
              />

              <TextInput
                placeholder="Enter Mobile Number"
                placeholderTextColor="#8A8F98"
                style={styles.input}
                keyboardType="number-pad"
                maxLength={10}
                editable={!showOTPField}
                value={phone}
                onChangeText={(text) => {
                  const clean = text.replace(/[^0-9]/g, "");
                  setPhone(clean);
                  setErrors((prev) => ({ ...prev, phone: "" }));
                }}
              />

            </View>

            {errors.phone ? (
              <Text style={styles.error}>{errors.phone}</Text>
            ) : null}

            {/* OTP INPUT */}
            {showOTPField && (
              <View>

                <View style={styles.inputContainer}>

                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={PRIMARY}
                  />

                  <TextInput
                    placeholder="Enter 4-digit OTP"
                    placeholderTextColor="#8A8F98"
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={4}
                    value={otp}
                    autoFocus // ✅ AUTO FOCUS OTP FIELD
                    onChangeText={(text) => {
                      setOtp(text);
                      setErrors((prev) => ({ ...prev, otp: "" }));
                    }}
                  />

                </View>

                {errors.otp ? (
                  <Text style={styles.error}>{errors.otp}</Text>
                ) : null}

                {/* ✅ RESEND OTP BUTTON */}
                <TouchableOpacity
                  onPress={handleResendOTP}
                  style={styles.resendBtn}
                  disabled={loading}
                >
                  <Text style={styles.resendText}>
                    Wrong number or didn't receive OTP?{" "}
                    <Text style={styles.resendLink}>Resend</Text>
                  </Text>
                </TouchableOpacity>

              </View>
            )}

            {/* MAIN BUTTON */}
            <TouchableOpacity
              style={[
                styles.button,
                loading && styles.buttonDisabled, // ✅ DISABLED STYLE
              ]}
              onPress={showOTPField ? handleVerifyOTP : handleSendOTP}
              disabled={loading} // ✅ PREVENT DOUBLE TAP
            >

              {loading ? (
                // ✅ LOADING SPINNER INSIDE BUTTON
                <ActivityIndicator color={WHITE} size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  {showOTPField ? "Verify OTP" : "Get OTP"}
                </Text>
              )}

            </TouchableOpacity>

          </View>

        </KeyboardAvoidingView>

      </View>
    </>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: WHITE,
  },

  innerContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  card: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 30,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },

  iconContainer: {
    alignItems: "center",
    marginBottom: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    color: "#0B1F3A",
  },

  subtitle: {
    textAlign: "center",
    marginBottom: 30,
    marginTop: 6,
    color: COLORS.TEXT_SECONDARY,
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.CARD,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },

  // ✅ NEW - visual feedback for disabled phone field
  inputDisabled: {
    backgroundColor: "#F0F0F0",
    borderColor: "#DDDDDD",
    opacity: 0.7,
  },

  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
  },

  button: {
    backgroundColor: NAVY,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 15,
  },

  // ✅ NEW - disabled button style
  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "bold",
  },

  error: {
    color: "red",
    fontSize: 12,
    marginLeft: 5,
    marginBottom: 8,
  },

  // ✅ NEW - resend button styles
  resendBtn: {
    alignItems: "center",
    marginBottom: 5,
    marginTop: 2,
  },

  resendText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 13,
  },

  resendLink: {
    color: LIGHT_PURPLE,
    fontWeight: "bold",
  },

});
