import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "../../styles/theme";

interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  keyboardViewStyle?: StyleProp<ViewStyle>;
  contentBottomInset?: number;
  keyboardVerticalOffset?: number;
}

export function KeyboardAwareScrollView({
  children,
  keyboardViewStyle,
  contentContainerStyle,
  contentBottomInset = spacing.xl,
  keyboardVerticalOffset = 0,
  keyboardShouldPersistTaps = "handled",
  keyboardDismissMode = "on-drag",
  ...props
}: KeyboardAwareScrollViewProps) {
  const insets = useSafeAreaInsets();
  const flattenedContent = StyleSheet.flatten(contentContainerStyle) as ViewStyle | undefined;
  const existingPaddingBottom =
    typeof flattenedContent?.paddingBottom === "number" ? flattenedContent.paddingBottom : 0;

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardView, keyboardViewStyle]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        {...props}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={[
          contentContainerStyle,
          { paddingBottom: existingPaddingBottom + contentBottomInset + insets.bottom },
        ]}
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
});
