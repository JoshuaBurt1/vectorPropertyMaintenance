"use client";

import { useState, useEffect } from "react";

const words = ["home.", "office.", "garage.", "warehouse.", "garden.", "front yard.", "backroom.", "parking lot."];

export default function Typewriter() {
  const [index, setIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [blink, setBlink] = useState(true);

  // Blinking cursor effect
  useEffect(() => {
    const timeout2 = setTimeout(() => {
      setBlink((prev) => !prev);
    }, 500);
    return () => clearTimeout(timeout2);
  }, [blink]);

  // Typing logic
  useEffect(() => {
    if (subIndex === words[index].length + 1 && !isDeleting) {
      setTimeout(() => setIsDeleting(true), 2000); // Pause before deleting
      return;
    }

    if (subIndex === 0 && isDeleting) {
      setIsDeleting(false);
      setIndex((prev) => (prev + 1) % words.length);
      return;
    }

    const timeout = setTimeout(() => {
      setSubIndex((prev) => prev + (isDeleting ? -1 : 1));
    }, isDeleting ? 50 : 120); // Faster deletion, slower typing

    return () => clearTimeout(timeout);
  }, [subIndex, index, isDeleting]);

  return (
    <span className="inline-block">
      {words[index].substring(0, subIndex)}
      <span className={`${blink ? "opacity-100" : "opacity-0"} ml-1 border-l-4 border-black dark:border-white h-full`}></span>
    </span>
  );
}