import { useEffect } from "react";
import {
  View,
  Dimensions,
  Image,
  ImageBackground,
  StatusBar,
  StyleSheet,
} from "react-native";

import Animated, {
  Easing,

  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

export default function SplashScreen({ onFinish }) {
  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const logoFloat = useSharedValue(0);

  const subtitleOpacity = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    // Logo Animation
    logoOpacity.value = withTiming(1, { duration: 100 });

    logoScale.value = withSpring(1, {
      damping: 6,
      stiffness: 120,
    });

    // Floating effect
    logoFloat.value = withDelay(
      1200,
      withRepeat(
        withTiming(-10, {
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      )
    );

    // Subtitle animation
    subtitleOpacity.value = withDelay(
      1200,
      withTiming(1, { duration: 200 })
    );

    // Splash exit
    screenOpacity.value = withDelay(
      9000,
      withTiming(0, { duration: 200 }, (finished) => {
        if (finished && onFinish) {
          runOnJS(onFinish)();
        }
      })
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [
      { scale: logoScale.value },
      { translateY: logoFloat.value },
    ],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  return (
    <Animated.View style={[styles.wrapper, screenStyle]}>
      <StatusBar barStyle="light-content" />

      <ImageBackground
        source={require("../../assets/images/starting.png")}
        style={styles.background}
        resizeMode="cover"
      >
        {/* Purple overlay for smooth UI */}
        <View style={styles.overlay}>
          {/* Logo */}
          <Animated.View style={logoStyle}>
            <Image
              source={require("../../assets/images/RenntoLogo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Subtitle */}
          <Animated.Text style={[styles.subtitle, subtitleStyle]}>
            SMART RENTAL APP
          </Animated.Text>
          {/* Bottom Text */}
          <Animated.Text style={[styles.bottomText, subtitleStyle]}>
            Secure Rentals • Easy Booking • Trusted Stays
          </Animated.Text>
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },

  background: {
    flex: 1,
    width: width,
    height: height,
  },

  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  logo: {
    width: 200,
    height: 200,
  },

  subtitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: {
      width: 0,
      height: 2,
    },
    textShadowRadius: 4,
  },
  bottomText: {
    position: "absolute",
    bottom: 60,
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 1,
    textAlign: "center",

    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 3,
  },
});