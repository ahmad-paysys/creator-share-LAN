module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#081319",
        mint: "#B5F2C6",
        sand: "#F6F0D8",
        coral: "#FF7A66",
        ocean: "#0F4C5C",
      },
      boxShadow: {
        glow: "0 16px 60px rgba(10, 46, 56, 0.24)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise 500ms ease-out forwards",
      },
    },
  },
  plugins: [],
};
