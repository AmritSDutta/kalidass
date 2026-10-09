import ComponentTypes from "@theme-original/NavbarItem/ComponentTypes";
import AuthNavbarItem from "@site/src/components/AuthNavbarItem";
import NeuralGenNavbarItem from "@site/src/components/NeuralGenNavbarItem";

export default {
  ...ComponentTypes,
  "custom-auth": AuthNavbarItem,
  "custom-neural-gen": NeuralGenNavbarItem,
};
