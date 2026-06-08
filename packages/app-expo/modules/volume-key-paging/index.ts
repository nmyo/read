import { NativeModule, requireNativeModule } from "expo";
import { Platform } from "react-native";

type VolumeKeyPagingEvents = {
  VolumeKeyPaging: (payload: { direction: "prev" | "next" }) => void;
};

declare class VolumeKeyPagingModule extends NativeModule<VolumeKeyPagingEvents> {
  setEnabled(enabled: boolean): void;
}

const noop = {
  setEnabled: () => {},
  addListener: () => ({ remove: () => {} }),
} as unknown as VolumeKeyPagingModule;

const mod: VolumeKeyPagingModule =
  Platform.OS === "android" ? requireNativeModule<VolumeKeyPagingModule>("VolumeKeyPaging") : noop;

export default mod;
