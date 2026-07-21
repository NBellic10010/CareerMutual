import { LoginChooser } from "@/src/components/functional/login-chooser";
import { SYNTHETIC_DEMO_ACTORS } from "@onlyboth/demo-fixtures";

export default function LoginPage() {
  return <LoginChooser actors={SYNTHETIC_DEMO_ACTORS} />;
}
