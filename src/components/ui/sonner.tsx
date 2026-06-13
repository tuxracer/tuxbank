import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="dark"
    position="bottom-center"
    toastOptions={{
      classNames: {
        toast: "cy-toast",
        actionButton: "cy-toast-action",
      },
    }}
    {...props}
  />
);

export { Toaster };
