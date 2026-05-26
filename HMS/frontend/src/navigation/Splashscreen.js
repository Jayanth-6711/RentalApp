import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Dimensions, Image, StatusBar, StyleSheet } from "react-native";
 
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
 
  const titleOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const screenOpacity = useSharedValue(1);
 
  // Bubble animations
  const bubble1 = useSharedValue(height);
  const bubble2 = useSharedValue(height);
  const bubble3 = useSharedValue(height);
 
  useEffect(() => {
    // Logo intro
    logoOpacity.value = withTiming(1, { duration: 800 });
    logoScale.value = withSpring(1, { damping: 6, stiffness: 120 });
 
    // Floating logo
    logoFloat.value = withDelay(
      1200,
      withRepeat(
        withTiming(-10, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
 
    // Text animation
    titleOpacity.value = withDelay(1000, withTiming(1, { duration: 800 }));
    subtitleOpacity.value = withDelay(1400, withTiming(1, { duration: 800 }));
 
    // Exit animation (shortened slightly for standard splash behavior)
    screenOpacity.value = withDelay(
      5000, // Adjusted for smoother transition
      withTiming(0, { duration: 900 }, (finished) => {
        if (finished && onFinish) {
          runOnJS(onFinish)();
        }
      })
    );
  }, []);
 
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }, { translateY: logoFloat.value }],
  }));
 
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
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
 
      <LinearGradient colors={["#ede0f0", "#5b1e8a"]} style={styles.container}>
        {/* Background Bubbles (Uncommented for effect) */}
        <Animated.View style={[styles.bubble, styles.b1]} />
        <Animated.View style={[styles.bubble, styles.b2]} />
        <Animated.View style={[styles.bubble, styles.b3]} />
 


 {/* Rennto PNG Logo */}
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
      </LinearGradient>
    </Animated.View>
  );
}
 
const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  logo: {
  width: 280,
  height: 280,
},
  title: {
    marginTop: 10,
    fontSize: 42,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1.5,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "600",
    color: "#e8d5f0",
    letterSpacing: 2,
  },
  bubble: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 100,
  },
  b1: {
    width: 150,
    height: 150,
    top: height * 0.1,
    left: width * 0.8,
  },
  b2: {
    width: 250,
    height: 250,
    top: height * 0.6,
    left: -width * 0.2,
  },
  b3: {
    width: 100,
    height: 100,
    top: height * 0.4,
    left: width * 0.6,
  },
});
 