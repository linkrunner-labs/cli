import type { ProjectType } from "../types/index.js";

interface CodeSnippetParams {
  projectToken: string;
  secretKey?: string;
  keyId?: string;
}

interface CodeSnippets {
  init: string;
  signup: string;
  setUserData: string;
}

function flutterSnippets(p: CodeSnippetParams): CodeSnippets {
  const signingArgs = p.secretKey && p.keyId
    ? `\n      '${p.secretKey}',\n      '${p.keyId}',`
    : "";

  return {
    init: `import 'package:linkrunner/linkrunner.dart';

Future<void> initLinkrunner() async {
  try {
    await LinkRunner().init(
      '${p.projectToken}',${signingArgs}
    );
    print('LinkRunner initialized');
  } catch (e) {
    print('Error initializing LinkRunner: \$e');
  }
}

// Call this in your app's initialization
@override
void initState() {
  WidgetsFlutterBinding.ensureInitialized();
  super.initState();
  initLinkrunner();
}`,

    signup: `Future<void> onSignup() async {
  try {
    await LinkRunner().signup(
      userData: LRUserData(
        id: 'USER_ID',
        name: 'User Name',
        email: 'user@example.com',
      ),
      data: {},
    );
    print('Signup successful');
  } catch (e) {
    print('Error during signup: \$e');
  }
}`,

    setUserData: `Future<void> setUserData() async {
  try {
    await LinkRunner().setUserData(
      userData: LRUserData(
        id: 'USER_ID',
        name: 'User Name',
        email: 'user@example.com',
      ),
    );
    print('User data set successfully');
  } catch (e) {
    print('Error setting user data: \$e');
  }
}`,
  };
}

function reactNativeSnippets(p: CodeSnippetParams): CodeSnippets {
  const signingArgs = p.secretKey && p.keyId
    ? `\n    '${p.secretKey}',\n    '${p.keyId}',`
    : "";

  return {
    init: `import linkrunner from 'rn-linkrunner';

// Inside your React component
useEffect(() => {
  init();
}, []);

const init = async () => {
  await linkrunner.init(
    '${p.projectToken}',${signingArgs}
  );
  console.log('Linkrunner initialized');
};`,

    signup: `const onSignup = async () => {
  try {
    await linkrunner.signup({
      user_data: {
        id: 'USER_ID',
        name: 'User Name',
        email: 'user@example.com',
      },
      data: {},
    });
    console.log('Signup successful');
  } catch (error) {
    console.error('Error during signup:', error);
  }
};`,

    setUserData: `const setUserData = async () => {
  await linkrunner.setUserData({
    id: 'USER_ID',
    name: 'User Name',
    email: 'user@example.com',
  });
};`,
  };
}

function androidSnippets(p: CodeSnippetParams): CodeSnippets {
  const signingArgs = p.secretKey && p.keyId
    ? `\n                    secretKey = "${p.secretKey}",\n                    keyId = "${p.keyId}",`
    : "";

  return {
    init: `import io.linkrunner.sdk.LinkRunner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

// In your Application class or main activity
CoroutineScope(Dispatchers.IO).launch {
    try {
        LinkRunner.getInstance().init(
            context = applicationContext,
            token = "${p.projectToken}",${signingArgs}
        )
        println("LinkRunner initialized successfully")
    } catch (e: Exception) {
        println("Error: \${e.message}")
    }
}`,

    signup: `import io.linkrunner.sdk.models.request.UserDataRequest

val userData = UserDataRequest(
    id = "USER_ID",
    name = "User Name",
    email = "user@example.com",
)

LinkRunner.getInstance().signup(
    userData = userData,
    additionalData = mapOf()
)`,

    setUserData: `val userData = UserDataRequest(
    id = "USER_ID",
    name = "User Name",
    email = "user@example.com",
)

LinkRunner.getInstance().setUserData(userData)`,
  };
}

function iosSnippets(p: CodeSnippetParams): CodeSnippets {
  const signingArgs = p.secretKey && p.keyId
    ? `,\n                    secretKey: "${p.secretKey}",\n                    keyId: "${p.keyId}"`
    : "";

  return {
    init: `import Linkrunner

// In your App init or AppDelegate
Task {
    do {
        try await LinkrunnerSDK.shared.initialize(
            token: "${p.projectToken}"${signingArgs}
        )
        print("Linkrunner initialized successfully")
    } catch {
        print("Error initializing Linkrunner:", error)
    }
}`,

    signup: `func onSignup() async {
    do {
        let userData = UserData(
            id: "USER_ID",
            name: "User Name",
            email: "user@example.com"
        )

        try await LinkrunnerSDK.shared.signup(
            userData: userData,
            additionalData: [:]
        )
        print("Signup successful")
    } catch {
        print("Error during signup:", error)
    }
}`,

    setUserData: `func setUserData() async {
    do {
        let userData = UserData(
            id: "USER_ID",
            name: "User Name",
            email: "user@example.com"
        )

        try await LinkrunnerSDK.shared.setUserData(userData)
        print("User data set successfully")
    } catch {
        print("Error setting user data:", error)
    }
}`,
  };
}

function webSnippets(p: CodeSnippetParams): CodeSnippets {
  return {
    init: `import LinkrunnerSDK from '@linkrunner/web-sdk';

// Initialize the SDK
window.LinkrunnerSDK.init({
  token: '${p.projectToken}',
});`,

    signup: `// Web SDK does not have a signup method.
// Use trackEvent for custom events instead.`,

    setUserData: `// Web SDK does not have a setUserData method.
// Use trackEvent for custom events instead.`,
  };
}

function capacitorSnippets(p: CodeSnippetParams): CodeSnippets {
  const signingArgs = p.secretKey && p.keyId
    ? `\n    '${p.secretKey}',\n    '${p.keyId}',`
    : "";

  return {
    init: `import linkrunner from 'capacitor-linkrunner';

const init = async () => {
  await linkrunner.init(
    '${p.projectToken}',${signingArgs}
  );
  console.log('Linkrunner initialized');
};

init();`,

    signup: `const onSignup = async () => {
  try {
    await linkrunner.signup({
      user_data: {
        id: 'USER_ID',
        name: 'User Name',
        email: 'user@example.com',
      },
      data: {},
    });
    console.log('Signup successful');
  } catch (error) {
    console.error('Error during signup:', error);
  }
};`,

    setUserData: `const setUserData = async () => {
  await linkrunner.setUserData({
    id: 'USER_ID',
    name: 'User Name',
    email: 'user@example.com',
  });
};`,
  };
}

const generators: Record<ProjectType, (p: CodeSnippetParams) => CodeSnippets> = {
  flutter: flutterSnippets,
  "react-native": reactNativeSnippets,
  expo: reactNativeSnippets,
  android: androidSnippets,
  ios: iosSnippets,
  web: webSnippets,
  capacitor: capacitorSnippets,
};

export function generateCodeSnippets(
  type: ProjectType,
  params: CodeSnippetParams,
): CodeSnippets {
  return generators[type](params);
}

export type { CodeSnippetParams, CodeSnippets };
