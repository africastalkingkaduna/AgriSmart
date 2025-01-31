import React, { useState } from "react";
import axios from "axios";
import axiosRetry from "axios-retry";
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
import { storage } from "../../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import diseasesData from "../../server/diseasesData";
import { jsPDF } from "jspdf";
//import html2canvas from "html2canvas";
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
const Upload = () => {
  const [image, setImage] = useState(null);
  const [imageURL, setImageURL] = useState(null);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sendingSMS, setSendingSMS] = useState(false);
  const [showPhoneNumberInput, setShowPhoneNumberInput] = useState(false);

  const handleFileChange = async (e) => {
 
    setResult(null);
    setUploading(true);
    const file = e.target.files[0];
    setImage(file);
    if (file) {
      try {
        const storageRef = ref(storage, `photos/${file.name}`);
        await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(storageRef);
        setImageURL(imageUrl);
        console.log(imageUrl);
      } catch (error) {
        console.error("Error uploading image:", error);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleImageDiagnose = async (e) => {
    setResult(null);
    e.preventDefault();
    setDiagnosing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Image = e.target.result.split(",")[1];
      try {
        const response = await axios.post(
          "https://crop.kindwise.com/api/v1/identification",
          { images: [base64Image] },
          {
            headers: {
              "Content-Type": "application/json",
              "Api-Key": import.meta.env.VITE_KINDWISE_API_KEY,
            },
          }
        );
        console.log(response.data.result);
        const diseaseSuggestions =
          response.data?.result?.disease?.suggestions || [];
        const cropSuggestions = response.data?.result?.crop?.suggestions || [];
        const topDiseases = diseaseSuggestions
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 5); // Show top 5 diseases

        const diseases = topDiseases.map((suggestion) => ({
          name: suggestion.name || "Unknown disease",
          scientificName:
            suggestion.scientific_name || "Unknown scientific name",
          probability: (suggestion.probability * 100).toFixed(2) + "%",
          treatment:
            diseasesData[suggestion.name.toLowerCase()]?.treatment ||
            "No treatment available",
          prevention:
            diseasesData[suggestion.name.toLowerCase()]?.prevention ||
            "No prevention available",
        }));

        let status = "Infected";
        if (
          diseases[0]?.name.toLowerCase() === "healthy" ||
          (diseases[1]?.name.toLowerCase() === "healthy" &&
            parseFloat(diseases[1].probability) > 10)
        ) {
          status = "Healthy";
        }

        setResult({
          diseases: diseases,
          plant: cropSuggestions[0]?.name || "Unknown plant",
          suggestions: cropSuggestions.map((suggestion) => ({
            name: suggestion.name || "Unknown plant",
            probability: (suggestion.probability * 100).toFixed(2) + "%",
          })),
          status: status,
        });
      } catch (error) {
        if (error.response && error.response.status === 429) {
          alert("You have reached the maximum number of requests. Please try again later.");
        }
        console.error("Error diagnosing image:", error);
      } finally {
        setDiagnosing(false);
      }
    };
    reader.readAsDataURL(image);
  };

  const downloadReport = async () => {
    const doc = new jsPDF();
    doc.setFontSize(16);

    // Title
    doc.text("Crop / Plant Health Report", 20, 20);
    doc.setFontSize(12);

    // Status
    doc.text(`Status: ${result.status}`, 20, 30);
    // Plant
    doc.text(`Plant: ${result.plant}`, 20, 40);

    // Possible Plants
    doc.text("Possible Plants:", 20, 50);
    let yOffset = 60;
    result.suggestions.forEach((sug) => {
      doc.text(`- ${sug.name} (${sug.probability})`, 20, yOffset);
      yOffset += 10;
    });

    // Possible Diseases & Recommendations
    doc.text("Possible Diseases & Recommendations:", 20, yOffset);
    yOffset += 10;

    result.diseases.forEach((disease, index) => {
      doc.text(`Disease ${index + 1}:`, 20, yOffset);
      yOffset += 10;
      doc.text(`Name: ${disease.name}`, 20, yOffset);
      yOffset += 10;
      doc.text(`Scientific Name: ${disease.scientificName}`, 20, yOffset);
      yOffset += 10;
      doc.text(`Probability: ${disease.probability}`, 20, yOffset);
      yOffset += 10;
      doc.text(`Treatment: ${disease.treatment}`, 20, yOffset);
      yOffset += 10;
      doc.text(`Prevention: ${disease.prevention}`, 20, yOffset);
      yOffset += 10;
      doc.text(`Learn more: ${getTipsUrl(disease.name)}`, 20, yOffset);
      yOffset += 20; // Add extra space between diseases
    });

    // Save the PDF
    doc.save("diagnosis-report.pdf");
  };
  const getTipsUrl = (disease) => {
    return disease
      ? "https://www.apsnet.org/edcenter/disimpactmngmnt/topc/EpidemiologyTemporal/Pages/ManagementStrategies.aspx"
      : "https://www.elitetreecare.com/2021/02/maintaining-plant-health-tips/";
  };
  const generateReportText = () => {
    let reportText = "Crop / Plant Health Report\n\n";
    reportText += `Status: ${result.status}\n`;
    reportText += `Plant: ${result.plant}\n\n`;

    reportText += "Possible Plants:\n";
    result.suggestions.forEach((sug) => {
      reportText += `- ${sug.name} (${sug.probability})\n`;
    });

    reportText += "\nPossible Diseases & Recommendations:\n";
    if (result.status === "Infected") {
      result.diseases.forEach((disease, index) => {
        reportText += `\nDisease ${index + 1}:\n`;
        reportText += `Name: ${disease.name}\n`;
        reportText += `Scientific Name: ${disease.scientificName}\n`;
        reportText += `Probability: ${disease.probability}\n`;
        reportText += `Treatment: ${disease.treatment}\n`;
        reportText += `Prevention: ${disease.prevention}\n`;
        reportText += `Learn more: ${getTipsUrl(disease.name)}\n`;
      });
    }

    return reportText;
  };

  const sendReportViaSMS = async () => {
    if (!validatePhoneNumber(phoneNumber)) {
      alert(
        "Invalid phone number. Please enter a valid Nigerian phone number."
      );
      return;
    }

    const formattedNumber = formatPhoneNumber(phoneNumber);
    setSendingSMS(true);

    try {
      const reportText = generateReportText(); // Generate the report as plain text
      const response = await axios.post("http://localhost:3000/send-sms", {
        to: formattedNumber,
        message: reportText,
      });

      if (response.data.status === "success") {
        alert("Report sent successfully!");
        setPhoneNumber("");
        setShowPhoneNumberInput(false);
      } else {
        alert("Failed to send report. Please try again later.");
      }
    } catch (error) {
      console.error("Error sending SMS:", error);
      alert("Error sending SMS: " + error.message);
    } finally {
      setSendingSMS(false);
    }
  };

  const validatePhoneNumber = (number) => {
    const regex = /^(?:\+234|0)(?:7|8|9)[0-9]{9}$/;
    return regex.test(number);
  };

  const formatPhoneNumber = (number) => {
    if (number.startsWith("0")) {
      return "+234" + number.slice(1);
    }
    return number;
  };
  return (
    <section className="md:w-[80%] font-mulish w-[90%] mx-auto my-20 rounded-sm shadow-lg bg-white">
      <div className="relative">
        <span className="mx-auto z-[0] bg-[#F7FAFE] block md:block hidden rounded-md h-[67px] w-[259px]"></span>
        <h1 className="text-center font-roboto absolute top-0 left-1/2 transform -translate-x-1/2 md:text-[40px] z-60 mx-auto text-[18px] font-[700]">
          Upload a Picture
        </h1>
      </div>

      <div className="text-[#111111] font-[500] space-y-8 py-10 px-5">
        <h3 className="text-[20px] md:text-[25px]">
          Your Crop / Plant Health Report
        </h3>
        <p className="text-[18px] font-[400]">
          Based on the image you provided, here are the details of your crop's
          health status.
        </p>

        <div
          style={{
            backgroundImage: imageURL ? `url(${imageURL})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          className="bg-[#F6F7F9] md:w-[483px] h-[205px] flex items-center"
        >
          <input
            type="file"
            id="fileUpload"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>

        <div className="items-center block md:space-y-0 space-y-2 md:flex md:w-[65%] lg:w-[55%]">
          <button
            onClick={handleImageDiagnose}
            className="font-roboto rounded-lg w-full md:w-[50%] text-white px-10 py-3 bg-primary"
            disabled={diagnosing}
          >
            {diagnosing ? "Diagnosing..." : "Diagnose"}
          </button>
          <label
            htmlFor="fileUpload"
            className="border cursor-pointer mx-auto text-center mx-auto block border-[#90BFA8] rounded-[6px] text-[#90BFA8] shadow-sm py-3 px-6"
          >
            {uploading
              ? "Uploading..."
              : imageURL
              ? "Change Image"
              : "Upload Image"}
          </label>
        </div>
      </div>
      {result && (
        <div className="mx-5 p-5 rounded-lg shadow-lg">
          <h3 className="text-[20px] md:text-[25px] font-bold mb-4">
            Diagnosis Result
          </h3>
          <ol className="mb-4 space-y-4 list-decimal list-inside ml-3">
            <li className="space-y-1">
              <p className="text-lg inline font-bold">Status</p>{" "}
              <small
                className={
                  result.status === "Infected"
                    ? "text-red-600 block ml-5"
                    : "text-green-600 block ml-5"
                }
              >
                {result.status}
              </small>
            </li>
            <li className="space-y-1">
              <p className="text-lg inline font-bold">Plant</p>
              <small className="block ml-5">{result.plant}</small>
            </li>
            <li className="space-y-1">
              <p className="text-lg inline font-bold">Possible Plants</p>
              {result.suggestions.map((sug, index) => (
                <small key={index} className="block ml-5">
                  {sug.name} ({sug.probability})
                </small>
              ))}
            </li>
            <li className="space-y-1">
              <p className="text-lg inline font-bold">
                Possible Diseases & Recommendations
              </p>
              {result.status === "Infected" && (
                <div className="grid grid-cols-1 md:grid-cols-2 my-3 gap-4">
                  {result.diseases.slice(0, 4).map((disease, index) => (
                    <div
                      key={index}
                      className="space-y-2 border p-3 rounded-lg shadow-sm"
                    >
                      <p className="text-lg font-bold">Disease {index + 1}</p>
                      <small className="block">Name: {disease.name}</small>
                      <small className="block">
                        Scientific Name: {disease.scientificName}
                      </small>
                      <small className="block">
                        Probability: {disease.probability}
                      </small>
                      <small className="block">
                        Treatment: {disease.treatment}
                      </small>
                      <small className="block">
                        Prevention: {disease.prevention}
                      </small>
                      <a
                        href={disease.learnMore}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Learn more
                      </a>
                      
                    </div>
                  ))}
                </div>
              )}
            </li>
          </ol>
          <div className="space-y-5 my-10 ">
            <button
              onClick={downloadReport}
              className="font-roboto rounded-lg w-full text-white px-10 py-3 bg-primary"
            >
              Download Report
            </button>

            <button
              onClick={() => setShowPhoneNumberInput(true)}
              className="font-roboto rounded-lg w-full text-primary px-10 py-3 border border-primary"
            >
              Send Diagnosis Report via SMS
            </button>
          </div>

          {showPhoneNumberInput && (
            <div className="mt-5">
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Enter phone number"
                className="border p-2 rounded-md w-full"
              />
              <button
                onClick={sendReportViaSMS}
                className="font-roboto rounded-lg w-full mt-3 text-white px-10 py-3 bg-primary"
                disabled={sendingSMS}
              >
                {sendingSMS ? "Sending..." : "Send Report"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default Upload;
