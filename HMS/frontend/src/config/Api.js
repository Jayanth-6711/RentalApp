import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = "http://192.168.1.29:8000";
export const WS_BASE_URL = BASE_URL.replace("http://", "ws://").replace("https://", "wss://");

export const fetchWithAuth = async (url, options = {}) => {
    const token = await AsyncStorage.getItem("userToken");

    const headers = {
        ...options.headers,
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers,
    };

    const response = await fetch(url, config);
    return response;
};

export default BASE_URL;
