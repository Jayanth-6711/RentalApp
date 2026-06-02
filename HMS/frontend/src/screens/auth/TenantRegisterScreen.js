import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import BASE_URL, { fetchWithAuth } from "@/src/config/Api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../../utils/LanguageContext";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import COLORS from "@/src/theme/colors";

const WHITE = COLORS.WHITE;
const NAVY = COLORS.PRIMARY;
const LIGHT_PURPLE = COLORS.PRIMARY_LIGHT;
const apiKey = process.env.EXPO_PUBLIC_OTP_API_KEY;

export default function TenantRegisterScreen({ navigation }) {
  const { t } = useLanguage();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const otpInputs = useRef([]);
  const [sessionId, setSessionId] = useState("");

  const [showOTPField, setShowOTPField] = useState(false);
  const [showNameField, setShowNameField] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  const [loadingOTP, setLoadingOTP] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingRegister, setLoadingRegister] = useState(false);

  const [errors, setErrors] = useState({});

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  /* ---------------- VALIDATION ---------------- */

  const removeEmojis = (text) =>
    text.replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
      .replace(/[\u2600-\u27BF]/g, "");

  const validateName = (name) => {
    const regex = /^[A-Za-z ]{3,30}$/;
    return regex.test(name) && name.trim().length >= 3;
  };

  const validatePhone = (phone) => /^[6-9][0-9]{9}$/.test(phone);

  /* ---------------- SEND OTP ---------------- */

  const handleGetOTP = async () => {

    if (!validatePhone(phone)) {
      setErrors((prev) => ({
        ...prev,
        phone: "Enter valid 10-digit number",
      }));
      return;
    }

    try {

      setLoadingOTP(true);

      const response = await fetchWithAuth(
        `https://2factor.in/API/V1/${apiKey}/SMS/${phone}/AUTOGEN3/OTP1`
      );

      const data = await response.json();
      console.log("OTP Response:", data);

      if (data.Status === "Success") {

        setSessionId(data.Details);
        setShowOTPField(true);
        setOtp(["", "", "", ""]);
        setErrors({});

        Alert.alert("Success", "OTP sent successfully");

      } else {
        Alert.alert("Error", "Failed to send OTP");
      }

    } catch (error) {

      console.log(error);
      Alert.alert("Error", "Something went wrong");

    } finally {

      setLoadingOTP(false);

    }
  };

  /* ---------------- RESEND OTP ---------------- */

  const handleResendOTP = () => {
    setOtp(["", "", "", ""]);
    setErrors({});
    setShowOTPField(false);
    setSessionId("");
  };

  /* ---------------- VERIFY OTP ---------------- */

  const handleVerifyOTP = async () => {
    const otpString = otp.join("");
    if (otpString.length !== 4) {
      setErrors((prev) => ({
        ...prev,
        otp: "Enter valid 4-digit OTP",
      }));
      return;
    }

    try {

      setLoadingVerify(true);

      const response = await fetchWithAuth(
        `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otpString}`
      );

      const data = await response.json();
      console.log("LOG VERIFY OTP RESPONSE:", data);

      if (data.Status !== "Success") {

        setOtp("");
        setErrors((prev) => ({
          ...prev,
          otp: "Invalid OTP",
        }));
        return;
      }

      setIsPhoneVerified(true);

      const checkResponse = await fetchWithAuth(
        `${BASE_URL}/api/check-user/${phone}/`
      );

      const userData = await checkResponse.json();
      console.log("USER CHECK:", userData);

      if (userData.exists) {

        // Save tenant phone number
        await AsyncStorage.setItem("tenantPhone", phone);
        if (userData.token) {
          await AsyncStorage.setItem("userToken", userData.token);
        }

        // Save tenant email for future API calls
        if (userData.email) {
          await AsyncStorage.setItem("tenantEmail", userData.email);
        }

        // Extract tenant ID from various possible response shapes (prefer userData)
        const id =
          userData.user?.id ||
          userData.id ||
          data?.data?.id ||
          data?.tenant?.id ||
          data?.id ||
          data?.tenant_id;

        if (id) {
          await AsyncStorage.setItem("tenantId", id.toString());
        }

        console.log("SAVED TENANT ID:", id);

        Alert.alert("Welcome", "Login Successful");

        navigation.reset({
          index: 0,
          routes: [{ name: "TenantNavigation" }],
        });

      } else {

        setShowOTPField(false);
        setShowNameField(true);

      }

    } catch (error) {

      console.log("LOG  CHECK USER ERROR:", error);
      Alert.alert("Error", "Something went wrong");

    } finally {

      setLoadingVerify(false);

    }
  };

  /* ---------------- REGISTER ---------------- */

  const handleRegister = async () => {

    const e = {};

    if (!name.trim() || !validateName(name)) {
      e.name = t("name_error") || "Name must be 3-30 letters only";
    }

    if (!isPhoneVerified) {
      e.phone = "Mobile number must be verified";
    }

    setErrors(e);
    if (Object.keys(e).length > 0) return;

    try {

      setLoadingRegister(true);

      const formData = new FormData();
      formData.append("name", name);
      formData.append("phone", phone);

      const response = await fetchWithAuth(`${BASE_URL}/api/tenent/`, {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        data = { message: responseText };
      }

      if (response.status === 201 || response.status === 200) {

        console.log("REGISTER RESPONSE:", data);

        // SAVE PHONE
        await AsyncStorage.setItem("tenantPhone", phone);

        // SAVE TOKEN
        if (data.token) {
          await AsyncStorage.setItem("userToken", data.token);
        }

        // SAVE TENANT ID
        await AsyncStorage.setItem(
          "tenantId",
          data.data.id.toString()
        );

        console.log("SAVED TENANT ID:", data.data.id);

        Alert.alert(
          t("success") || "Success",
          t("registration_success") || "Registration Successful!"
        );

        navigation.reset({
          index: 0,
          routes: [{ name: "TenantNavigation" }],
        });

      } else {

        console.log("Registration Error:", data);
        Alert.alert(
          t("error") || "Error",
          data.errors
            ? JSON.stringify(data.errors)
            : data.message || t("registration_failed") || "Registration failed"
        );

      }

    } catch (error) {

      console.error("Network Error:", error);
      Alert.alert(
        t("error") || "Error",
        t("server_error") || "Server not reachable. Please check your connection."
      );

    } finally {

      setLoadingRegister(false);

    }
  };

  /* ---------------- UI ---------------- */

  // Determine current loading state
  const isLoading = loadingOTP || loadingVerify || loadingRegister;

  return (
    <>
      {/* ✅ SAME StatusBar as OwnerLoginScreen */}
      <StatusBar
        barStyle="light-content"
        backgroundColor={NAVY}
      />
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, zIndex: 100 }}
      >
        <Ionicons name="arrow-back" size={28} color={NAVY} />
      </TouchableOpacity>

      <View style={styles.container}>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.innerContainer}
        >

          <Animated.View
            style={[
              styles.card,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >

            {/* ✅ SAME ICON STYLE as OwnerLoginScreen */}
            <View style={styles.iconContainer}>
              <Ionicons
                name="person-circle-outline"
                size={75}
                color={LIGHT_PURPLE}
              />
            </View>

            {/* ✅ SAME TITLE STYLE */}
            <Text style={styles.title}>
              {t("Sign In/Sign Up") || "Create Account"}
            </Text>

            <Text style={styles.subtitle}>
              Login With Mobile OTP
            </Text>

            {/* PHONE INPUT — same style as OwnerLoginScreen */}
            <View style={[
              styles.inputContainer,
              isPhoneVerified && styles.inputDisabled,
            ]}>

              <Ionicons
                name="call-outline"
                size={20}
                color={isPhoneVerified ? COLORS.TEXT_SECONDARY : LIGHT_PURPLE}
              />

              <TextInput
                placeholder="Enter Mobile Number"
                placeholderTextColor="#8A8F98"
                style={styles.input}
                keyboardType="number-pad"
                maxLength={10}
                editable={!isPhoneVerified}
                value={phone}
                onChangeText={(text) => {
                  const clean = text.replace(/[^0-9]/g, "");
                  setPhone(clean);
                  setErrors((prev) => ({ ...prev, phone: "" }));
                }}
              />

              {/* VERIFIED BADGE */}
              {isPhoneVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="green"
                  />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}

              {/* GET OTP INLINE BUTTON */}
              {!isPhoneVerified &&
                validatePhone(phone) &&
                !showOTPField && (
                  <TouchableOpacity
                    onPress={handleGetOTP}
                    disabled={loadingOTP}
                    style={[
                      styles.inlineBtn,
                      loadingOTP && styles.buttonDisabled,
                    ]}
                  >
                    {loadingOTP ? (
                      <ActivityIndicator size="small" color={WHITE} />
                    ) : (
                      <Text style={styles.inlineBtnText}>Get OTP</Text>
                    )}
                  </TouchableOpacity>
                )}

            </View>

            {errors.phone ? (
              <Text style={styles.error}>{errors.phone}</Text>
            ) : null}

            {/* OTP INPUT — same style as OwnerLoginScreen */}
            {showOTPField && !isPhoneVerified && (
              <View>

                <View style={styles.otpWrapper}>

                  {[0, 1, 2, 3].map((index) => (

                    <TextInput
                      key={index}

                      ref={(ref) =>
                        (otpInputs.current[index] = ref)
                      }

                      style={styles.otpBox}

                      keyboardType="number-pad"

                      maxLength={index === 0 ? 4 : 1}

                      value={otp[index]}

                      autoFocus={index === 0}

                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"

                      onChangeText={(value) => {
                        console.log(`[OTP DEBUG] TenantRegister index: ${index}, value: "${value}"`);

                        // Handle paste/autofill of full OTP
                        if (value.length > 1) {
                          console.log(`[OTP DEBUG] Multi-character paste detected! Extracted: ${value.slice(0, 4)}`);
                          const pasted = value.slice(0, 4).replace(/[^0-9]/g, "").split("");
                          // pad with empty strings if less than 4
                          while (pasted.length < 4) pasted.push("");
                          
                          setOtp(pasted);
                          setErrors((prev) => ({ ...prev, otp: "" }));
                          if (pasted.join("").length === 4) {
                            otpInputs.current[3]?.focus();
                          }
                          return;
                        }

                        // single character input
                        setOtp((prevOtp) => {
                          const newOtp = [...prevOtp];
                          newOtp[index] = value;
                          return newOtp;
                        });

                        setErrors((prev) => ({ ...prev, otp: "" }));

                        if (value && index < 3) {
                          otpInputs.current[index + 1]?.focus();
                        }
                      }}

                      onKeyPress={({ nativeEvent }) => {
                        if (nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
                          otpInputs.current[
                            index - 1
                          ]?.focus();
                        }

                      }}
                    />

                  ))}

                </View>

                {errors.otp ? (
                  <Text style={styles.error}>{errors.otp}</Text>
                ) : null}

                {/* RESEND BUTTON — same style as OwnerLoginScreen */}
                <TouchableOpacity
                  onPress={handleResendOTP}
                  disabled={loadingVerify}
                  style={styles.resendBtn}
                >
                  <Text style={styles.resendText}>
                    Wrong number or didn't receive OTP?{" "}
                    <Text style={styles.resendLink}>Resend</Text>
                  </Text>
                </TouchableOpacity>

              </View>
            )}

            {/* NAME INPUT — appears after OTP verified */}
            {showNameField && (
              <View>

                <View style={styles.inputContainer}>

                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={LIGHT_PURPLE}
                  />

                  <TextInput
                    placeholder="Enter Full Name"
                    placeholderTextColor="#8A8F98"
                    style={styles.input}
                    maxLength={30}
                    autoFocus
                    value={name}
                    onChangeText={(text) => {
                      const clean = removeEmojis(text)
                        .replace(/[^A-Za-z ]/g, "");
                      setName(clean);
                      setErrors((prev) => ({
                        ...prev,
                        name: validateName(clean)
                          ? ""
                          : "Name must be 3+ letters",
                      }));
                    }}
                  />

                </View>

                {errors.name ? (
                  <Text style={styles.error}>{errors.name}</Text>
                ) : null}

              </View>
            )}

            {/* MAIN BUTTON — same exact style as OwnerLoginScreen */}
            {(showOTPField || showNameField) && (
              <TouchableOpacity
                style={[
                  styles.button,
                  isLoading && styles.buttonDisabled,
                ]}
                onPress={showNameField ? handleRegister : handleVerifyOTP}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={WHITE} size="small" />
                ) : (
                  <Text style={styles.buttonText}>
                    {showNameField ? "Register" : "Verify OTP"}
                  </Text>
                )}
              </TouchableOpacity>
            )}

          </Animated.View>

        </KeyboardAvoidingView>

      </View>
    </>
  );
}

const styles = StyleSheet.create({

  // ✅ EXACT SAME as OwnerLoginScreen styles
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
  otpWrapper: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 15,
    marginTop: 10,
  },

  otpBox: {
    width: 48,
    height: 50,

    borderRadius: 12,

    backgroundColor: "#FFFFFF",

    borderWidth: 1.5,
    borderColor: "#D8D8E0",

    textAlign: "center",

    fontSize: 17,
    fontWeight: "500",

    color: COLORS.TEXT_PRIMARY,

    paddingVertical: 0,

    includeFontPadding: false,
    textAlignVertical: "center",

    elevation: 2,

    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  button: {
    backgroundColor: NAVY,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 15,
  },

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

  // Extra styles for tenant screen
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  verifiedText: {
    color: "green",
    fontWeight: "bold",
    fontSize: 12,
    marginLeft: 4,
  },

  inlineBtn: {
    backgroundColor: NAVY,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 60,
    alignItems: "center",
  },

  inlineBtnText: {
    color: WHITE,
    fontWeight: "bold",
    fontSize: 12,
  },

});