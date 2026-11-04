import { mount } from "svelte";
import App from "./App.svelte";
import "./style.css";
import "./board.css";
import "./controls.css";

mount(App, { target: document.getElementById("app") as HTMLElement });

import "./account.css";
