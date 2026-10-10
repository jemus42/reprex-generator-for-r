import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist", "out"] },
    ...tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        rules: {
            curly: "warn",
            eqeqeq: "warn",
            "no-throw-literal": "warn",
        },
    },
);
